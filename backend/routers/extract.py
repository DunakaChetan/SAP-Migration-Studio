from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
import requests
import xml.etree.ElementTree as ET
import pandas as pd
import io
import json
import logging
# Suppress insecure request warnings for sandbox self-signed certs
import urllib3
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
from agents.extract_agent import ExtractAgent
from services.supabase_client import supabase_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/sap/extract", tags=["Extract"])

class ConnectionRequest(BaseModel):
    base_url: str
    client: Optional[str] = ""
    username: Optional[str] = ""
    password: Optional[str] = ""
    system_type: Optional[str] = "SAP_ECC"

class FetchSampleRequest(ConnectionRequest):
    target_object: str

@router.post("/fetch_sample")
def fetch_sample(req: FetchSampleRequest):
    if not req.base_url:
        raise HTTPException(status_code=400, detail="Base URL is required")
        
    try:
        base_url = req.base_url.rstrip('/')
        
        # Determine the OData URL based on target object
        if req.target_object in ['CUSTOMER', 'VENDOR']:
            api_path = "/sap/opu/odata/sap/API_BUSINESS_PARTNER/A_BusinessPartner?$top=10"
        elif req.target_object == 'MATERIAL':
            api_path = "/sap/opu/odata/sap/API_PRODUCT_SRV/A_Product?$top=10"
        else:
            raise HTTPException(status_code=400, detail=f"Unsupported target object for live extraction: {req.target_object}")
            
        fetch_url = f"{base_url}{api_path}"
        if req.client:
            fetch_url += f"&sap-client={req.client}"
            
        print(f"Fetching sample data from: {fetch_url}")
        
        session = requests.Session()
        session.trust_env = False
        
        res = session.get(
            fetch_url,
            auth=(req.username, req.password),
            headers={"Accept": "application/json"},
            timeout=30,
            verify=False
        )
        
        if res.status_code == 200:
            data = res.json()
            # S/4HANA OData v2 typically returns data inside d.results
            results = data.get("d", {}).get("results", [])
            
            # Clean up the metadata tags if present
            cleaned_results = []
            for row in results:
                if "__metadata" in row:
                    del row["__metadata"]
                # Flatten simple values, drop navigation links
                flat_row = {}
                for k, v in row.items():
                    if isinstance(v, dict):
                        continue # Skip deferred navigation properties
                    flat_row[k] = str(v) if v is not None else ""
                cleaned_results.append(flat_row)
                
            return {"status": "success", "data": cleaned_results}
        elif res.status_code in [401, 403]:
            raise HTTPException(status_code=401, detail="Authentication failed or user lacks permissions for this API.")
        elif res.status_code == 404:
            raise HTTPException(status_code=404, detail="The OData API for this object is not activated on the SAP server.")
        else:
            raise HTTPException(status_code=400, detail=f"SAP returned error {res.status_code}: {res.text[:200]}")
            
    except requests.exceptions.Timeout:
        raise HTTPException(status_code=408, detail="Connection timed out while fetching data.")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/fetch_schema")
def fetch_schema(req: FetchSampleRequest):
    if not req.base_url:
        raise HTTPException(status_code=400, detail="Base URL is required")
        
    try:
        base_url = req.base_url.rstrip('/')
        
        # Determine the OData Metadata URL based on target object
        if req.target_object in ['CUSTOMER', 'VENDOR']:
            api_path = "/sap/opu/odata/sap/API_BUSINESS_PARTNER/$metadata"
            entity_name = "A_BusinessPartnerType"
        elif req.target_object == 'MATERIAL':
            api_path = "/sap/opu/odata/sap/API_PRODUCT_SRV/$metadata"
            entity_name = "A_ProductType"
        else:
            raise HTTPException(status_code=400, detail=f"Unsupported target object for schema fetch: {req.target_object}")
            
        fetch_url = f"{base_url}{api_path}"
        if req.client:
            fetch_url += f"?sap-client={req.client}"
            
        print(f"Fetching schema metadata from: {fetch_url}")
        
        session = requests.Session()
        session.trust_env = False
        
        res = session.get(
            fetch_url,
            auth=(req.username, req.password),
            timeout=30,
            verify=False
        )
        
        if res.status_code == 200:
            root = ET.fromstring(res.text)
            # OData XML namespaces usually look like {http://schemas.microsoft.com/ado/2008/09/edm}EntityType
            # To be safe, we can iterate and check ends with
            fields = []
            for elem in root.iter():
                if elem.tag.endswith('EntityType') and elem.attrib.get('Name') == entity_name:
                    for prop in elem.iter():
                        if prop.tag.endswith('Property'):
                            name = prop.attrib.get('Name')
                            if name:
                                fields.append(name)
                    break
                    
            if not fields:
                raise HTTPException(status_code=404, detail="Could not parse fields from metadata XML.")
                
            return {"status": "success", "fields": fields}
            
        elif res.status_code in [401, 403]:
            raise HTTPException(status_code=401, detail="Authentication failed.")
        else:
            raise HTTPException(status_code=400, detail=f"SAP returned error {res.status_code}")
            
    except requests.exceptions.Timeout:
        raise HTTPException(status_code=408, detail="Connection timed out while fetching schema.")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

class ExecuteExtractionRequest(ConnectionRequest):
    target_object: str
    mappings: list

@router.post("/execute")
@router.post("/live")
def execute_extraction(req: ExecuteExtractionRequest):
    if not req.base_url:
        raise HTTPException(status_code=400, detail="Base URL is required")
        
    try:
        agent = ExtractAgent()
        harmonized_data = agent.perform_extraction(
            base_url=req.base_url,
            client=req.client,
            username=req.username,
            password=req.password,
            target_object=req.target_object,
            mappings=req.mappings
        )
        
        quality_report = agent.generate_eda_quality_report(
            harmonized_results=harmonized_data,
            target_object=req.target_object,
            mappings=req.mappings
        )

        tables = agent.group_records_by_sap_structure(
            harmonized_results=harmonized_data,
            target_object=req.target_object,
            mappings=req.mappings
        )
        
        return {
            "status": "success", 
            "data": harmonized_data,
            "tables": tables,
            "eda_stats": quality_report.get("eda_stats", []),
            "compliance_data": quality_report.get("compliance_data", []),
            "summary_metrics": quality_report.get("summary_metrics", {}),
            "aiAnalysis": {
                "report": quality_report.get("ai_report", {})
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/upload")
async def upload_file(file: UploadFile = File(...)):
    try:
        contents = await file.read()
        if file.filename.endswith('.csv'):
            df = pd.read_csv(io.BytesIO(contents))
        elif file.filename.endswith(('.xls', '.xlsx')):
            df = pd.read_excel(io.BytesIO(contents))
        else:
            raise HTTPException(status_code=400, detail="Only CSV and Excel files are supported")
        
        # Replace NaN with empty string
        df = df.fillna("")
        
        # Check for 2-header row structure (e.g. Table Names in row 0, Field Names in row 1)
        if not df.empty and len(df) > 0:
            first_row_vals = [str(v).strip() for v in df.iloc[0].values]
            col_bases = [str(col).split('.')[0] for col in df.columns]
            if len(col_bases) != len(set(col_bases)) and len(set(first_row_vals)) == len(first_row_vals):
                df.columns = first_row_vals
                df = df.iloc[1:].reset_index(drop=True)

        headers = list(df.columns)
        data = df.to_dict(orient="records")
        
        return {"status": "success", "headers": headers, "data": data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to process file: {str(e)}")

@router.post("/upload-preview")
async def upload_preview(files: List[UploadFile] = File(...)):
    try:
        results = []
        for file in files:
            contents = await file.read()
            if file.filename.endswith('.csv'):
                df = pd.read_csv(io.BytesIO(contents), nrows=5)
            elif file.filename.endswith(('.xls', '.xlsx')):
                df = pd.read_excel(io.BytesIO(contents), nrows=5)
            else:
                continue
                
            # Replace NaN with empty string
            df = df.fillna("")
            
            if not df.empty and len(df) > 0:
                first_row_vals = [str(v).strip() for v in df.iloc[0].values]
                col_bases = [str(col).split('.')[0] for col in df.columns]
                if len(col_bases) != len(set(col_bases)) and len(set(first_row_vals)) == len(first_row_vals):
                    df.columns = first_row_vals
                    
            results.append({
                "filename": file.filename,
                "headers": list(df.columns)
            })
            
        return {"status": "success", "files": results}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to process files: {str(e)}")

@router.post("/upload-merge")
async def upload_merge(
    join_config: str = Form(...),
    files: List[UploadFile] = File(...)
):
    try:
        config = json.loads(join_config)
        base_filename = config.get("base_file")
        joins = config.get("joins", []) # [{"join_file": "B.csv", "base_key": "ID", "join_key": "FK"}]
        
        dfs = {}
        for file in files:
            contents = await file.read()
            if file.filename.endswith('.csv'):
                df = pd.read_csv(io.BytesIO(contents))
            elif file.filename.endswith(('.xls', '.xlsx')):
                df = pd.read_excel(io.BytesIO(contents))
            else:
                continue
                
            if not df.empty and len(df) > 0:
                first_row_vals = [str(v).strip() for v in df.iloc[0].values]
                col_bases = [str(col).split('.')[0] for col in df.columns]
                if len(col_bases) != len(set(col_bases)) and len(set(first_row_vals)) == len(first_row_vals):
                    df.columns = first_row_vals
                    df = df.iloc[1:].reset_index(drop=True)
            
            # Stringify all columns to avoid type mismatch during merge
            df = df.astype(str)
            dfs[file.filename] = df

        if base_filename not in dfs:
            raise ValueError(f"Base file {base_filename} not found in uploaded files.")
            
        merged_df = dfs[base_filename].fillna("")
        
        # Process joins in dependency order (topological execution)
        merged_files = {base_filename}
        column_aliases = {}
        pending_joins = list(joins)
        max_iterations = len(pending_joins) * 4
        iteration = 0

        while pending_joins and iteration < max_iterations:
            iteration += 1
            # Find a join whose source_file is already merged
            join_to_process = None
            join_index = -1

            for idx, j in enumerate(pending_joins):
                src_f = j.get("source_file") or base_filename
                if src_f in merged_files:
                    join_to_process = j
                    join_index = idx
                    break

            if not join_to_process:
                # If no direct match in merged_files, pick the first available
                join_to_process = pending_joins[0]
                join_index = 0

            pending_joins.pop(join_index)

            join_file = join_to_process.get("join_file")
            source_file = join_to_process.get("source_file") or base_filename
            
            # Extract list of key pairs (composite support) or fallback to single base_key/join_key
            key_pairs = join_to_process.get("key_pairs") or []
            if not key_pairs:
                b_k = join_to_process.get("base_key")
                j_k = join_to_process.get("join_key")
                if b_k and j_k:
                    key_pairs = [{"base_key": b_k, "join_key": j_k}]
            
            raw_left_keys = [str(kp.get("base_key", "")).strip() for kp in key_pairs if kp.get("base_key")]
            right_keys = [str(kp.get("join_key", "")).strip() for kp in key_pairs if kp.get("join_key")]
            
            if join_file in dfs and raw_left_keys and right_keys and len(raw_left_keys) == len(right_keys):
                join_df = dfs[join_file].fillna("")
                file_tag = join_file.split(".")[0]
                source_tag = source_file.split(".")[0] if source_file else ""

                # Resolve actual column name in merged_df for each left key
                actual_left_keys = []
                for k in raw_left_keys:
                    if k in merged_df.columns:
                        actual_left_keys.append(k)
                    elif f"{k}_{source_tag}" in merged_df.columns:
                        actual_left_keys.append(f"{k}_{source_tag}")
                    elif k in column_aliases and column_aliases[k] in merged_df.columns:
                        actual_left_keys.append(column_aliases[k])
                    elif f"{source_file}.{k}" in column_aliases and column_aliases[f"{source_file}.{k}"] in merged_df.columns:
                        actual_left_keys.append(column_aliases[f"{source_file}.{k}"])
                    else:
                        # Case insensitive or normalized search in merged_df
                        k_clean = k.lower().replace("_", "").replace(" ", "").replace("-", "")
                        matched = None
                        for c in merged_df.columns:
                            c_clean = c.lower().replace("_", "").replace(" ", "").replace("-", "")
                            if c.lower() == k.lower() or c_clean == k_clean or c.lower().endswith("." + k.lower()):
                                matched = c
                                break
                        # If still not found, check if it's an ID field that matches any primary ID column
                        if not matched and ('id' in k_clean or 'key' in k_clean):
                            for c in merged_df.columns:
                                c_clean = c.lower().replace("_", "").replace(" ", "").replace("-", "")
                                if 'id' in c_clean or 'key' in c_clean or 'kunnr' in c_clean:
                                    matched = c
                                    break
                        actual_left_keys.append(matched or k)

                # Check if any left key is missing in merged_df
                missing_keys = [k for k in actual_left_keys if k not in merged_df.columns]
                if missing_keys and pending_joins:
                    # Source table columns not ready yet; re-queue to merge after other tables
                    pending_joins.append(join_to_process)
                    continue

                # Suffix overlapping non-key columns to avoid errors and preserve data
                merged_df = pd.merge(
                    merged_df, 
                    join_df, 
                    left_on=actual_left_keys if len(actual_left_keys) > 1 else actual_left_keys[0], 
                    right_on=right_keys if len(right_keys) > 1 else right_keys[0], 
                    how='left',
                    suffixes=('', f'_{file_tag}')
                )

                # Remove redundant foreign key columns so only the primary keys are kept for mapping
                for b_k, j_k in zip(actual_left_keys, right_keys):
                    column_aliases[j_k] = b_k
                    column_aliases[f"{join_file}.{j_k}"] = b_k
                    if j_k and j_k != b_k and j_k in merged_df.columns:
                        merged_df.drop(columns=[j_k], inplace=True)
                    
                    # If foreign key had the same name and was suffixed, drop the redundant suffixed column
                    suffixed_fk = f"{j_k}_{file_tag}"
                    if suffixed_fk in merged_df.columns:
                        merged_df.drop(columns=[suffixed_fk], inplace=True)

                merged_files.add(join_file)
                
        merged_df = merged_df.fillna("").replace(["nan", "None", "<NA>"], "")
        headers = list(merged_df.columns)
        data = merged_df.to_dict(orient="records")
        
        return {"status": "success", "headers": headers, "data": data}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Merge failed: {str(e)}")

class ExecuteFileRequest(BaseModel):
    target_object: str
    mappings: list
    raw_data: list

@router.post("/execute_file")
def execute_file_extraction(req: ExecuteFileRequest):
    try:
        agent = ExtractAgent()
        
        raw_data = req.raw_data or []
        mapping_src_fields = set(
            str(m.get('src', '')).split('.')[-1].lower() 
            for m in req.mappings if m.get('src')
        )
        if raw_data and len(raw_data) > 0:
            first_row_vals = set(
                str(v).strip().split('.')[-1].lower() 
                for v in raw_data[0].values() 
                if isinstance(v, (str, int)) and str(v).strip()
            )
            if len(first_row_vals.intersection(mapping_src_fields)) >= 2:
                raw_data = raw_data[1:]

        def extract_cell_val(row_dict, src_key):
            if not row_dict or not src_key:
                return ""
            if src_key in row_dict and row_dict[src_key] is not None:
                return str(row_dict[src_key])
            
            src_short = src_key.split(".")[-1]
            if src_short in row_dict and row_dict[src_short] is not None:
                return str(row_dict[src_short])
            
            src_lower = src_key.lower()
            src_short_lower = src_short.lower()
            for k, v in row_dict.items():
                k_lower = str(k).lower()
                k_short = k_lower.split(".")[-1]
                if k_lower == src_lower or k_short == src_short_lower or k_lower.endswith("." + src_short_lower):
                    if v is not None:
                        return str(v)
            return ""

        # Manually apply transformations
        harmonized_results = []
        for row in raw_data:
            harmonized_row = dict(row)
            for m in req.mappings:
                src_full = m.get('src')
                if not src_full:
                    continue
                
                transform = m.get('tr', 'none')
                raw_val = extract_cell_val(row, src_full)

                if transform == 'trim':
                    val = raw_val.strip()
                elif transform == 'upper':
                    val = raw_val.upper()
                elif transform == 'email':
                    val = raw_val.strip().lower()
                elif transform == 'pad10':
                    val = raw_val.zfill(10) if raw_val.isdigit() else raw_val
                elif transform == 'country' or transform == 'currency':
                    val = raw_val.strip().upper()
                elif transform == 'date8':
                    s = raw_val.strip()
                    import re
                    m1 = re.match(r"^(\d{1,2})[/\-](\d{1,2})[/\-](\d{4})$", s)
                    m2 = re.match(r"^(\d{4})[/\-](\d{1,2})[/\-](\d{1,2})$", s)
                    if m1:
                        val = f"{m1.group(3)}{m1.group(2).zfill(2)}{m1.group(1).zfill(2)}"
                    elif m2:
                        val = f"{m2.group(1)}{m2.group(2).zfill(2)}{m2.group(3).zfill(2)}"
                    else:
                        val = raw_val
                else:
                    val = raw_val
                
                harmonized_row[src_full] = val
                src_short = src_full.split(".")[-1]
                if src_short != src_full:
                    harmonized_row[src_short] = val

            harmonized_results.append(harmonized_row)
        
        quality_report = agent.generate_eda_quality_report(
            harmonized_results=harmonized_results,
            target_object=req.target_object,
            mappings=req.mappings
        )

        tables = agent.group_records_by_sap_structure(
            harmonized_results=harmonized_results,
            target_object=req.target_object,
            mappings=req.mappings
        )
        
        return {
            "status": "success", 
            "data": harmonized_results,
            "tables": tables,
            "eda_stats": quality_report.get("eda_stats", []),
            "compliance_data": quality_report.get("compliance_data", []),
            "summary_metrics": quality_report.get("summary_metrics", {}),
            "aiAnalysis": {
                "report": quality_report.get("ai_report", {})
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

class SaveExtractionRequest(BaseModel):
    project_id: str
    target_object: str
    payload: list = []
    tables: Optional[list] = None

@router.post("/save")
def save_extraction(req: SaveExtractionRequest):
    try:
        client = supabase_service.get_client()
        # Resolve target_object name to object_id
        res_obj = client.table("sap_objects").select("id").ilike("name", req.target_object).execute()
        if not res_obj.data:
            clean_name = "Customer" if "CUSTOMER" in req.target_object.upper() else ("Vendor" if "VENDOR" in req.target_object.upper() else "Material")
            res_obj = client.table("sap_objects").select("id").ilike("name", clean_name).execute()

        if not res_obj.data:
            raise HTTPException(status_code=400, detail=f"SAP object '{req.target_object}' not found.")
        object_id = res_obj.data[0]["id"]
        
        # Delete old extraction if any
        client.table("extracted_data") \
            .delete() \
            .eq("project_id", req.project_id) \
            .eq("object_id", object_id) \
            .execute()
            
        # Store both flat rows and separated tables
        stored_payload = {
            "rows": req.payload,
            "tables": req.tables or []
        } if req.tables else req.payload

        # Insert the new payload
        res = client.table("extracted_data").insert({
            "project_id": req.project_id,
            "object_id": object_id,
            "payload": stored_payload
        }).execute()
        
        return {"status": "success", "message": "Extraction saved to database."}
    except Exception as e:
        logger.error(f"Failed to save extraction: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to save extraction: {str(e)}")

@router.get("/load/{project_id}")
def load_saved_extraction(project_id: str, target_object: Optional[str] = None):
    try:
        client = supabase_service.get_client()
        query = client.table("extracted_data").select("*, sap_objects(name)").eq("project_id", project_id)
        if target_object:
            clean_name = "Customer" if "CUSTOMER" in target_object.upper() else ("Vendor" if "VENDOR" in target_object.upper() else "Material")
            res_obj = client.table("sap_objects").select("id").ilike("name", clean_name).execute()
            if res_obj.data:
                query = query.eq("object_id", res_obj.data[0]["id"])
                
        res = query.order("created_at", desc=True).limit(1).execute()
        if not res.data:
            return {"status": "not_found", "data": [], "tables": []}
            
        raw_payload = res.data[0].get("payload")
        if isinstance(raw_payload, dict) and "tables" in raw_payload:
            return {
                "status": "success",
                "data": raw_payload.get("rows", []),
                "tables": raw_payload.get("tables", [])
            }
        elif isinstance(raw_payload, list):
            return {
                "status": "success",
                "data": raw_payload,
                "tables": []
            }
        return {"status": "success", "data": [], "tables": []}
    except Exception as e:
        logger.error(f"Failed to load extraction: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

class AISummaryRequest(BaseModel):
    stats: list
    score: int
    total_records: int
    target_object: str

@router.post("/ai_summary")
def generate_ai_summary(req: AISummaryRequest):
    try:
        from services.llm_orchestrator import llm_orchestrator
        import re
        
        system_prompt = "You are an expert SAP Data Migration Architect. Generate a professional summary from the exact algorithmic stats provided. Respond ONLY with valid JSON."
        user_prompt = f"""
        Algorithm Results for {req.target_object}:
        Records: {req.total_records}
        Score: {req.score}/100
        Field Analytics: {json.dumps(req.stats)}

        Based STRICTLY on the numbers provided, generate:
        {{
          "summary": "Executive summary paragraph...",
          "warnings": ["Critical warning 1", "Critical warning 2"],
          "recommendations": ["Action plan step 1", "Action plan step 2"]
        }}
        """
        
        result_str = llm_orchestrator.generate_generic(system_prompt, user_prompt)
        
        json_match = re.search(r"\{.*\}", result_str, re.DOTALL)
        if json_match:
            data = json.loads(json_match.group(0))
        else:
            data = json.loads(result_str)
            
        return {"status": "success", "aiAnalysis": data}
    except Exception as e:
        logger.error(f"Failed to generate AI summary: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
