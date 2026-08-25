from fastapi import APIRouter, File, Form, UploadFile, HTTPException
from pydantic import BaseModel
from typing import Annotated, Optional
from io import BytesIO
import pandas as pd

from services.supabase_client import supabase_service
from services.llm_orchestrator import LLMOrchestrator
from agents.transformation_agent import TransformationAgent
import json

router = APIRouter()

class SaveTransformRequest(BaseModel):
    project_id: str
    target_object: str
    payload: list

class PipelineStep(BaseModel):
    id: str
    type: str
    active: bool
    name: Optional[str] = None
    rules: Optional[list] = None
    python_code: Optional[str] = None

class ExecutePipelineRequest(BaseModel):
    project_id: str
    target_object: str
    pipeline: list[PipelineStep]

class AIPromptRequest(BaseModel):
    prompt: str
    columns: list[str]

class AITransformRequest(BaseModel):
    project_id: str
    target_object: str
    prompt: str
    current_data: Optional[list] = None

@router.post("/apply-mappings")
async def apply_transform_mappings(
    project_id: Annotated[str, Form()],
    target_object: Annotated[str, Form()],
    current_data: Annotated[Optional[str], Form()] = None,
    file: UploadFile = File(...)
):
    # 1. Read the uploaded file
    try:
        contents = await file.read()
        if file.filename.endswith(".csv"):
            mapping_df = pd.read_csv(BytesIO(contents), dtype=str)
        elif file.filename.endswith(".xlsx") or file.filename.endswith(".xls"):
            mapping_df = pd.read_excel(BytesIO(contents), dtype=str)
        else:
            raise HTTPException(400, "Only CSV and Excel files are supported.")
        
        # Strip whitespace from column names to be safe
        mapping_df.columns = mapping_df.columns.str.strip()
        
        required_cols = {"Source_Field", "Source_Data", "Target_Data"}
        if not required_cols.issubset(set(mapping_df.columns)):
            raise HTTPException(400, f"Uploaded file must contain exactly these columns: {required_cols}")
            
        mapping_rules = mapping_df.fillna("").to_dict(orient="records")
    except Exception as e:
        raise HTTPException(400, f"Error processing file: {str(e)}")

    client = supabase_service.get_client()

    # 2. Get Object ID
    res_obj = client.table("sap_objects").select("id").ilike("name", target_object).execute()
    if not res_obj.data:
        raise HTTPException(status_code=400, detail="Target object not found")
    object_id = res_obj.data[0]["id"]

    # 3. Fetch Cleansed Data or Use Current Data
    cleansed_rows = None
    if current_data and current_data.strip() and current_data != "[]":
        try:
            cleansed_rows = json.loads(current_data)
        except:
            pass
            
    if not cleansed_rows:
        res_cleansed = client.table("cleansed_data").select("payload").eq("project_id", project_id).eq("object_id", object_id).order("created_at", desc=True).limit(1).execute()
        
        if not res_cleansed.data:
            raise HTTPException(status_code=400, detail="No cleansed data found to transform. Run step 6 first.")
        
        cleansed_payload = res_cleansed.data[0]["payload"]
        if isinstance(cleansed_payload, dict) and "rows" in cleansed_payload:
            cleansed_rows = cleansed_payload["rows"]
        elif isinstance(cleansed_payload, list):
            cleansed_rows = cleansed_payload
        else:
            raise HTTPException(400, "Invalid cleansed data format.")

    # 4. Delegate transformation to the Agent
    agent = TransformationAgent()
    transformed_rows, summary = agent.apply_mappings(cleansed_rows, mapping_rules)

    return {
        "status": "success",
        "data": transformed_rows,
        "summary": summary
    }


@router.post("/save")
def save_transformed_data(req: SaveTransformRequest):
    try:
        client = supabase_service.get_client()
        res_obj = client.table("sap_objects").select("id").ilike("name", req.target_object).execute()
        
        if not res_obj.data:
            raise HTTPException(400, f"SAP object '{req.target_object}' not found")
        
        obj_id = res_obj.data[0]["id"]
        
        # 1. Clear previous records for this object and project
        client.table("transformed_data") \
            .delete() \
            .eq("project_id", req.project_id) \
            .eq("object_id", obj_id) \
            .execute()
        
        # 2. Insert new payload
        client.table("transformed_data").insert({
            "project_id": req.project_id,
            "object_id": obj_id,
            "payload": req.payload
        }).execute()
        
        return {"status": "success", "message": "Transformed data saved successfully."}
    except Exception as e:
        raise HTTPException(500, f"Failed to save transformed data: {str(e)}")

@router.post("/ai-apply-mappings")
def apply_ai_transform_mappings(req: AITransformRequest):
    client = supabase_service.get_client()

    # 1. Get Object ID
    res_obj = client.table("sap_objects").select("id").ilike("name", req.target_object).execute()
    if not res_obj.data:
        raise HTTPException(status_code=400, detail="Target object not found")
    object_id = res_obj.data[0]["id"]

    # 2. Fetch Cleansed Data or Use Current Data
    cleansed_rows = None
    if req.current_data and len(req.current_data) > 0:
        cleansed_rows = req.current_data
        
    if not cleansed_rows:
        res_cleansed = client.table("cleansed_data").select("payload").eq("project_id", req.project_id).eq("object_id", object_id).order("created_at", desc=True).limit(1).execute()
        
        if not res_cleansed.data:
            raise HTTPException(status_code=400, detail="No cleansed data found to transform. Run step 6 first.")
        
        cleansed_payload = res_cleansed.data[0]["payload"]
        if isinstance(cleansed_payload, dict) and "rows" in cleansed_payload:
            cleansed_rows = cleansed_payload["rows"]
        elif isinstance(cleansed_payload, list):
            cleansed_rows = cleansed_payload
        else:
            raise HTTPException(400, "Invalid cleansed data format.")

    if not cleansed_rows:
        raise HTTPException(400, "Cleansed data is empty.")

    # 3. Get actual columns
    available_columns = list(cleansed_rows[0].keys())

    # 4. Prompt LLM
    llm = LLMOrchestrator()
    system_prompt = f"""
    You are an SAP migration transformation assistant. 
    The user wants to transform a Pandas DataFrame based on a natural language instruction.
    The valid columns in the dataset are: {available_columns}
    
    Your task is to write a Python function `transform_data(df)` that applies the user's instructions to the DataFrame `df`.
    - `df` is a Pandas DataFrame where all columns are of string type.
    - Treat empty cells as empty strings `""` or `NaN`. Use `.fillna("")` or `.replace("", ...)` where appropriate.
    - Return the modified DataFrame.
    
    You MUST respond with ONLY a raw JSON object containing a "python_code" string key.
    
    Example response:
    {{
      "python_code": "def transform_data(df):\\n    df['INC01'] = df['INC01'].fillna('000')\\n    df['INC01'] = df['INC01'].replace('', '000')\\n    return df"
    }}
    """

    llm_response = None
    try:
        # LLMOrchestrator already parses and returns a Python dict or list!
        llm_response = llm.execute_json_prompt(system_prompt, req.prompt)
        
        if isinstance(llm_response, dict):
            python_code = llm_response.get("python_code", "")
        else:
            raise ValueError(f"Unexpected response type from LLM: {type(llm_response)}")
            
        if not python_code:
            raise ValueError("'python_code' is missing or empty")
    except Exception as e:
        raise HTTPException(500, f"Failed to parse AI response: {str(e)}\nRaw Response: {llm_response}")

    # 5. Delegate transformation to the Agent
    agent = TransformationAgent()
    transformed_rows, summary = agent.apply_ai_script(cleansed_rows, python_code)

    return {
        "status": "success",
        "data": transformed_rows,
        "summary": summary,
        "ai_rules": [{"Source_Field": "Python Script", "Source_Data": "", "Target_Data": python_code}] # For UI compatibility
    }

@router.post("/parse-mapping-file")
async def parse_mapping_file(file: UploadFile = File(...)):
    try:
        contents = await file.read()
        if file.filename.endswith(".csv"):
            mapping_df = pd.read_csv(BytesIO(contents), dtype=str)
        elif file.filename.endswith(".xlsx") or file.filename.endswith(".xls"):
            mapping_df = pd.read_excel(BytesIO(contents), dtype=str)
        else:
            raise HTTPException(400, "Only CSV and Excel files are supported.")
        
        mapping_df.columns = mapping_df.columns.str.strip()
        required_cols = {"Source_Field", "Source_Data", "Target_Data"}
        if not required_cols.issubset(set(mapping_df.columns)):
            raise HTTPException(400, f"Uploaded file must contain exactly these columns: {required_cols}")
            
        mapping_rules = mapping_df.fillna("").to_dict(orient="records")
        return {"rules": mapping_rules, "filename": file.filename}
    except Exception as e:
        raise HTTPException(400, f"Error processing file: {str(e)}")

@router.post("/generate-ai-script")
def generate_ai_script(req: AIPromptRequest):
    llm = LLMOrchestrator()
    system_prompt = f"""
    You are an SAP migration transformation assistant. 
    The user wants to transform a Pandas DataFrame based on a natural language instruction.
    The valid columns in the dataset are: {req.columns}
    
    Your task is to write a Python function `transform_data(df)` that applies the user's instructions to the DataFrame `df`.
    - `df` is a Pandas DataFrame where all columns are of string type.
    - Treat empty cells as empty strings `""` or `NaN`. Use `.fillna("")` or `.replace("", ...)` where appropriate.
    - Return the modified DataFrame.
    
    You MUST respond with ONLY a raw JSON object containing a "python_code" string key.
    """
    try:
        llm_response = llm.execute_json_prompt(system_prompt, req.prompt)
        if isinstance(llm_response, dict):
            python_code = llm_response.get("python_code", "")
        else:
            raise ValueError(f"Unexpected response type from LLM: {type(llm_response)}")
            
        if not python_code:
            raise ValueError("'python_code' is missing or empty")
            
        return {"python_code": python_code}
    except Exception as e:
        raise HTTPException(500, f"Failed to parse AI response: {str(e)}")

@router.post("/execute-pipeline")
def execute_pipeline(req: ExecutePipelineRequest):
    client = supabase_service.get_client()

    res_obj = client.table("sap_objects").select("id").ilike("name", req.target_object).execute()
    if not res_obj.data:
        raise HTTPException(status_code=400, detail="Target object not found")
    object_id = res_obj.data[0]["id"]

    res_cleansed = client.table("cleansed_data").select("payload").eq("project_id", req.project_id).eq("object_id", object_id).order("created_at", desc=True).limit(1).execute()
    
    if not res_cleansed.data:
        raise HTTPException(status_code=400, detail="No cleansed data found. Run step 6 first.")
    
    cleansed_payload = res_cleansed.data[0]["payload"]
    if isinstance(cleansed_payload, dict) and "rows" in cleansed_payload:
        current_rows = cleansed_payload["rows"]
    elif isinstance(cleansed_payload, list):
        current_rows = cleansed_payload
    else:
        raise HTTPException(400, "Invalid cleansed data format.")

    agent = TransformationAgent()
    
    total_summary = {
        "rows_loaded": len(current_rows),
        "rows_modified": 0,
        "total_modifications": 0,
        "mapping_rules_parsed": 0,
        "table_breakdowns": {},
        "audit_log": [],
        "ai_rules": []
    }
    
    for step in req.pipeline:
        if not step.active:
            continue
            
        if step.type == "mapping" and step.rules:
            current_rows, summary = agent.apply_mappings(current_rows, step.rules)
            
            total_summary["total_modifications"] += summary.get("total_modifications", 0)
            total_summary["rows_modified"] += summary.get("rows_modified", 0)
            total_summary["mapping_rules_parsed"] += summary.get("mapping_rules_parsed", 0)
            total_summary["audit_log"].extend(summary.get("audit_log", []))
            
            tb = summary.get("table_breakdowns", {})
            for t, fields in tb.items():
                if t not in total_summary["table_breakdowns"]:
                    total_summary["table_breakdowns"][t] = {}
                for f, stats in fields.items():
                    if f not in total_summary["table_breakdowns"][t]:
                        total_summary["table_breakdowns"][t][f] = {"count": 0, "changes": []}
                    total_summary["table_breakdowns"][t][f]["count"] += stats["count"]
                    total_summary["table_breakdowns"][t][f]["changes"].extend(stats["changes"])
                    
        elif step.type == "ai" and step.python_code:
            current_rows, summary = agent.apply_ai_script(current_rows, step.python_code)
            
            total_summary["total_modifications"] += summary.get("total_modifications", 0)
            total_summary["rows_modified"] += summary.get("rows_modified", 0)
            total_summary["mapping_rules_parsed"] += summary.get("mapping_rules_parsed", 0)
            total_summary["audit_log"].extend(summary.get("audit_log", []))
            
            total_summary["ai_rules"].append({
                "Source_Field": "AI Prompt",
                "Source_Data": step.name,
                "Target_Data": step.python_code
            })
            
            tb = summary.get("table_breakdowns", {})
            for t, fields in tb.items():
                if t not in total_summary["table_breakdowns"]:
                    total_summary["table_breakdowns"][t] = {}
                for f, stats in fields.items():
                    if f not in total_summary["table_breakdowns"][t]:
                        total_summary["table_breakdowns"][t][f] = {"count": 0, "changes": []}
                    total_summary["table_breakdowns"][t][f]["count"] += stats["count"]
                    total_summary["table_breakdowns"][t][f]["changes"].extend(stats["changes"])

    return {
        "status": "success",
        "data": current_rows,
        "summary": total_summary
    }

