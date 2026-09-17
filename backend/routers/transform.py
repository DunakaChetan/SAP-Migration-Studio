from fastapi import APIRouter, File, Form, UploadFile, HTTPException
from pydantic import BaseModel
from typing import Annotated, Optional
from io import BytesIO
import pandas as pd

from services.supabase_client import supabase_service
from services.llm_orchestrator import LLMOrchestrator
from agents.transformation_agent import TransformationAgent
import json
import logging

logger = logging.getLogger(__name__)

router = APIRouter()

class SaveTransformRequest(BaseModel):
    project_id: str
    target_object: str
    payload: list
    mock_cycle: Optional[str] = "mock-0"

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
    fallback_data: Optional[list] = None
    mock_cycle: Optional[str] = "mock-0"

class AIPromptRequest(BaseModel):
    prompt: str
    columns: list[str]

class AITransformRequest(BaseModel):
    project_id: str
    target_object: str
    prompt: str
    current_data: Optional[list] = None
    fallback_data: Optional[list] = None
    mock_cycle: Optional[str] = "mock-0"

class BatchTransformRequest(BaseModel):
    project_id: str
    target_object: str
    rules: list
    fallback_data: Optional[list] = None
    mock_cycle: Optional[str] = "mock-0"

@router.post("/apply-mappings")
async def apply_transform_mappings(
    project_id: Annotated[str, Form()],
    target_object: Annotated[str, Form()],
    current_data: Annotated[Optional[str], Form()] = None,
    mock_cycle: Annotated[Optional[str], Form()] = "mock-0",
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
        active_mock = mock_cycle or "mock-0"
        res_cleansed = client.table("cleansed_data").select("payload").eq("project_id", project_id).eq("object_id", object_id).eq("mock_cycle", active_mock).order("created_at", desc=True).limit(1).execute()
        
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
        mock_cycle = req.mock_cycle or "mock-0"
        
        # 1. Clear previous records for this object, project and mock cycle
        client.table("transformed_data") \
            .delete() \
            .eq("project_id", req.project_id) \
            .eq("object_id", obj_id) \
            .eq("mock_cycle", mock_cycle) \
            .execute()
        
        # 2. Insert new payload
        client.table("transformed_data").insert({
            "project_id": req.project_id,
            "object_id": obj_id,
            "mock_cycle": mock_cycle,
            "payload": req.payload
        }).execute()
        
        return {"status": "success", "message": "Transformed data saved successfully."}
    except Exception as e:
        raise HTTPException(500, f"Failed to save transformed data: {str(e)}")

@router.post("/ai-apply-mappings")
def apply_ai_transform_mappings(req: AITransformRequest):
    client = supabase_service.get_client()

    # 1. Fetch Cleansed Data or Use Current/Fallback Data
    cleansed_rows = None
    active_data = req.fallback_data or req.current_data
    if active_data and len(active_data) > 0:
        cleansed_rows = active_data
        
    if not cleansed_rows:
        res_obj = client.table("sap_objects").select("id").ilike("name", req.target_object).execute()
        if not res_obj.data:
            clean_name = "Customer" if "CUSTOMER" in req.target_object.upper() else ("Vendor" if "VENDOR" in req.target_object.upper() else "Material")
            res_obj = client.table("sap_objects").select("id").ilike("name", clean_name).execute()
        if not res_obj or not res_obj.data:
            raise HTTPException(status_code=400, detail=f"Target object '{req.target_object}' not found")
        object_id = res_obj.data[0]["id"]
        active_mock = req.mock_cycle or "mock-0"

        res_cleansed = client.table("cleansed_data").select("payload").eq("project_id", req.project_id).eq("object_id", object_id).eq("mock_cycle", active_mock).order("created_at", desc=True).limit(1).execute()
        
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

    # 2. Get actual columns dynamically
    available_columns = list(cleansed_rows[0].keys())

    # 3. Prompt LLM
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
      "python_code": "def transform_data(df):\\n    df['NAME1'] = df['NAME1'].fillna('')\\n    df['NAME1'] = df['NAME1'].str.upper()\\n    return df"
    }}
    """

    llm_response = None
    try:
        llm_response = llm.execute_json_prompt(system_prompt, req.prompt)
        
        if isinstance(llm_response, dict):
            python_code = llm_response.get("python_code", "")
        else:
            raise ValueError(f"Unexpected response type from LLM: {type(llm_response)}")
            
        if not python_code:
            raise ValueError("'python_code' is missing or empty")
    except Exception as e:
        raise HTTPException(500, f"Failed to parse AI response: {str(e)}\nRaw Response: {llm_response}")

    # 4. Delegate transformation to the Agent
    agent = TransformationAgent()
    transformed_rows, summary = agent.apply_ai_script(cleansed_rows, python_code)

    return {
        "status": "success",
        "data": transformed_rows,
        "summary": summary,
        "python_code": python_code,
        "ai_rules": [{"Source_Field": "Python Script", "Source_Data": "", "Target_Data": python_code}]
    }

@router.post("/apply-batch-rules")
def apply_batch_transform_rules(req: BatchTransformRequest):
    client = supabase_service.get_client()

    cleansed_rows = []

    # Prioritize fallback_data from active browser state if provided
    if req.fallback_data and len(req.fallback_data) > 0:
        cleansed_rows = req.fallback_data
    else:
        try:
            res_obj = client.table("sap_objects").select("id").ilike("name", req.target_object).execute()
            if not res_obj.data:
                clean_name = "Customer" if "CUSTOMER" in req.target_object.upper() else ("Vendor" if "VENDOR" in req.target_object.upper() else "Material")
                res_obj = client.table("sap_objects").select("id").ilike("name", clean_name).execute()
            if res_obj and res_obj.data:
                object_id = res_obj.data[0]["id"]
                active_mock = req.mock_cycle or "mock-0"
                res_cleansed = client.table("cleansed_data").select("payload").eq("project_id", req.project_id).eq("object_id", object_id).eq("mock_cycle", active_mock).order("created_at", desc=True).limit(1).execute()
                if res_cleansed.data:
                    cleansed_payload = res_cleansed.data[0]["payload"]
                    if isinstance(cleansed_payload, dict) and "rows" in cleansed_payload:
                        cleansed_rows = cleansed_payload["rows"]
                    elif isinstance(cleansed_payload, list):
                        cleansed_rows = cleansed_payload
        except Exception:
            pass

    if not cleansed_rows:
        raise HTTPException(status_code=400, detail="No cleansed data found to transform. Run step 6 first.")

    agent = TransformationAgent()
    transformed_rows, summary = agent.apply_rule_batch(cleansed_rows, req.rules)

    return {
        "status": "success",
        "data": transformed_rows,
        "summary": summary
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

    current_rows = None
    if req.fallback_data and len(req.fallback_data) > 0:
        current_rows = req.fallback_data
    else:
        try:
            res_obj = client.table("sap_objects").select("id").ilike("name", req.target_object).execute()
            if not res_obj.data:
                clean_name = "Customer" if "CUSTOMER" in req.target_object.upper() else ("Vendor" if "VENDOR" in req.target_object.upper() else "Material")
                res_obj = client.table("sap_objects").select("id").ilike("name", clean_name).execute()
            if res_obj and res_obj.data:
                object_id = res_obj.data[0]["id"]
                active_mock = req.mock_cycle or "mock-0"
                res_cleansed = client.table("cleansed_data").select("payload").eq("project_id", req.project_id).eq("object_id", object_id).eq("mock_cycle", active_mock).order("created_at", desc=True).limit(1).execute()
                if res_cleansed.data:
                    cleansed_payload = res_cleansed.data[0]["payload"]
                    if isinstance(cleansed_payload, dict) and "rows" in cleansed_payload:
                        current_rows = cleansed_payload["rows"]
                    elif isinstance(cleansed_payload, list):
                        current_rows = cleansed_payload
        except Exception:
            pass

    if not current_rows:
        raise HTTPException(status_code=400, detail="No cleansed data found. Run step 6 first.")

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

@router.get("/load/{project_id}")
def load_transformed_data(project_id: str, target_object: Optional[str] = None, mock_cycle: Optional[str] = "mock-0"):
    try:
        client = supabase_service.get_client()
        query = client.table("transformed_data").select("*, sap_objects(name)").eq("project_id", project_id).eq("mock_cycle", mock_cycle or "mock-0")
        if target_object:
            clean_name = "Customer" if "CUSTOMER" in target_object.upper() else ("Vendor" if "VENDOR" in target_object.upper() else "Material")
            res_obj = client.table("sap_objects").select("id").ilike("name", clean_name).execute()
            if res_obj.data:
                query = query.eq("object_id", res_obj.data[0]["id"])
        res = query.order("created_at", desc=True).limit(1).execute()
        if not res.data:
            return {"status": "not_found", "data": []}
        payload = res.data[0].get("payload", [])
        return {"status": "success", "data": payload if isinstance(payload, list) else (payload.get("rows", []) if isinstance(payload, dict) else [])}
    except Exception as e:
        logger.error(f"Failed to load transformed data: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to load transformed data: {str(e)}")


