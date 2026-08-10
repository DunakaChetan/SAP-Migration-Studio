"""
FastAPI Router for the Harmonization Agent.

Provides endpoints to:
  - POST /harmonize       : Upload files and run harmonization
  - GET  /harmonize/download/<id> : Download the final CSV result
"""

import io
import uuid
import logging
import re
from typing import Optional

from fastapi import APIRouter, File, Form, UploadFile, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import pandas as pd

from services.supabase_client import supabase_service
from agents.harmonization_agent import (
    HarmonizationAgent,
    HarmonizationConfig,
    parse_data_from_upload,
    parse_mapping_from_upload,
    MappingEntry
)

logger = logging.getLogger(__name__)

router = APIRouter()

# In-memory session store for download results (simple approach)
_session_store: dict = {}


@router.post("/harmonize")
async def run_harmonization(
    mode: str = Form(...),
    sap_object: str = Form("CUSTOMER"),
    company_code: str = Form("1000"),
    sales_org: str = Form("1000"),
    purch_org: str = Form("1000"),
    plant: str = Form("1000"),
    dist_channel: str = Form("10"),
    division: str = Form("00"),
    currency: str = Form("INR"),
    primary_source: str = Form("SAP_ECC"),
    secondary_source: str = Form("ORACLE_EBS"),
    primary_file: UploadFile = File(...),
    secondary_file: Optional[UploadFile] = File(None),
    primary_mapping_file: Optional[UploadFile] = File(None),
    secondary_mapping_file: Optional[UploadFile] = File(None),
):
    """
    Run the harmonization agent on uploaded files.

    Form fields:
      - mode: "single" or "multi"
      - sap_object: "CUSTOMER", "VENDOR", or "MATERIAL"
      - company_code, sales_org, purch_org, plant, dist_channel, division, currency
      - primary_source: Source system name for primary data (e.g. "SAP_ECC")
      - secondary_source: Source system name for secondary data (e.g. "ORACLE_EBS")
      - primary_file: CSV/Excel (required)
      - secondary_file: CSV/Excel (multi mode only)
      - primary_mapping_file: CSV (multi mode only)
      - secondary_mapping_file: CSV (multi mode only)
    """
    try:
        # Build config
        config = HarmonizationConfig(
            sap_object=sap_object.upper(),
            company_code=company_code,
        )

        agent = HarmonizationAgent(config)

        # Read primary file
        primary_content = await primary_file.read()
        primary_df = parse_data_from_upload(primary_content, primary_file.filename or "data.csv")

        if mode == "single":
            primary_mappings = None
            if primary_mapping_file and primary_mapping_file.filename:
                pm_content = await primary_mapping_file.read()
                primary_mappings = parse_mapping_from_upload(
                    pm_content, primary_mapping_file.filename or "mapping.csv"
                )
            result = agent.run_single_source(primary_df, primary_mappings, primary_source=primary_source)

        elif mode == "multi":
            # Read secondary file
            if not secondary_file or not secondary_file.filename:
                raise HTTPException(400, "Secondary file is required for multi mode")
            secondary_content = await secondary_file.read()
            secondary_df = parse_data_from_upload(
                secondary_content, secondary_file.filename or "data.csv"
            )

            # Read mapping files
            if not primary_mapping_file or not primary_mapping_file.filename:
                raise HTTPException(400, "Primary mapping file is required for multi mode")
            pm_content = await primary_mapping_file.read()
            primary_mappings = parse_mapping_from_upload(
                pm_content, primary_mapping_file.filename or "mapping.csv"
            )

            if not secondary_mapping_file or not secondary_mapping_file.filename:
                raise HTTPException(400, "Secondary mapping file is required for multi mode")
            sm_content = await secondary_mapping_file.read()
            secondary_mappings = parse_mapping_from_upload(
                sm_content, secondary_mapping_file.filename or "mapping.csv"
            )

            result = agent.run_multi_source(
                primary_df, secondary_df, primary_mappings, secondary_mappings,
                primary_source=primary_source, secondary_source=secondary_source
            )
        else:
            raise HTTPException(400, f"Invalid mode: {mode}. Must be 'single' or 'multi'")

        # Store result for download
        session_id = str(uuid.uuid4())
        _session_store[session_id] = result.final_table

        # Convert DataFrame to JSON-serializable format
        final_rows = result.final_table.fillna("").to_dict(orient="records")
        columns = list(result.final_table.columns)

        return {
            "session_id": session_id,
            "final_table": final_rows,
            "columns": columns,
            "stats": result.stats,
            "fix_log": result.fix_log,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Harmonization failed")
        raise HTTPException(500, f"Harmonization failed: {str(e)}")


class HarmonizeFlowRequest(BaseModel):
    project_id: str
    sap_object: str = "CUSTOMER"
    company_code: str = "1000"
    sales_org: str = "1000"
    purch_org: str = "1000"
    plant: str = "1000"
    dist_channel: str = "10"
    division: str = "00"
    currency: str = "INR"
    primary_source: str = "SAP_ECC"

@router.post("/harmonize/flow")
def run_harmonization_flow(req: HarmonizeFlowRequest):
    try:
        client = supabase_service.get_client()
        # Build config
        config = HarmonizationConfig(
            sap_object=req.sap_object.upper(),
            company_code=req.company_code,
        )
        agent = HarmonizationAgent(config)

        # Get object_id
        res_obj = client.table("sap_objects").select("id").ilike("name", req.sap_object).execute()
        if not res_obj.data:
            raise HTTPException(400, f"SAP object '{req.sap_object}' not found")
        object_id = res_obj.data[0]["id"]

        # 1. Fetch Extracted Data from DB
        res_data = client.table("extracted_data").select("payload").eq("project_id", req.project_id).eq("object_id", object_id).execute()
        if not res_data.data:
            raise HTTPException(400, "No extracted data found for this project and object in the database.")
        
        extracted_payload = res_data.data[0]["payload"]
        if not extracted_payload:
            raise HTTPException(400, "Extracted data payload is empty.")
            
        primary_df = pd.DataFrame(extracted_payload)

        # 2. Fetch User Corrected Mappings from DB
        res_map = client.table("user_corrected_mappings").select("source_field_name, transform_rule, confidence, sap_fields(sap_structure, field_name)").eq("project_id", req.project_id).execute()
        if not res_map.data:
            raise HTTPException(400, "No user corrected mappings found in the database for this project.")

        primary_mappings = []
        for m in res_map.data:
            sap_field = m.get("sap_fields")
            if not sap_field:
                continue
            sap_str = f"{sap_field.get('sap_structure', '')}.{sap_field.get('field_name', '')}"
            raw_src = m.get("source_field_name", "")
            clean_src = re.sub(r"^\[\d+\]", "", raw_src)
            primary_mappings.append(MappingEntry(
                src=clean_src,
                sap=sap_str,
                transform=m.get("transform_rule", "none"),
                confidence=int(m.get("confidence", 100))
            ))

        if not primary_mappings:
            raise HTTPException(400, "No valid mappings could be constructed from the database.")

        # 3. Run Agent
        result = agent.run_single_source(primary_df, primary_mappings, primary_source=req.primary_source)

        # Store result for download
        session_id = str(uuid.uuid4())
        _session_store[session_id] = result.final_table

        final_rows = result.final_table.fillna("").to_dict(orient="records")
        columns = list(result.final_table.columns)

        return {
            "session_id": session_id,
            "final_table": final_rows,
            "columns": columns,
            "stats": result.stats,
            "fix_log": result.fix_log,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Harmonization flow failed")
        raise HTTPException(500, f"Harmonization flow failed: {str(e)}")


@router.post("/harmonize/multi-flow")
async def run_harmonization_multi_flow(
    project_id: str = Form(...),
    sap_object: str = Form("CUSTOMER"),
    company_code: str = Form("1000"),
    sales_org: str = Form("1000"),
    purch_org: str = Form("1000"),
    plant: str = Form("1000"),
    dist_channel: str = Form("10"),
    division: str = Form("00"),
    currency: str = Form("INR"),
    primary_source: str = Form("SAP_ECC"),
    secondary_source: str = Form("ORACLE_EBS"),
    secondary_file: UploadFile = File(...),
    secondary_mapping_file: UploadFile = File(...),
):
    """
    Multi-source harmonization with primary data from DB and secondary data uploaded.

    - Primary data + mappings: fetched from database (extracted_data + user_corrected_mappings)
    - Secondary data + mapping: uploaded as files
    """
    try:
        client = supabase_service.get_client()

        config = HarmonizationConfig(
            sap_object=sap_object.upper(),
            company_code=company_code,
        )
        agent = HarmonizationAgent(config)

        # Get object_id
        res_obj = client.table("sap_objects").select("id").ilike("name", sap_object).execute()
        if not res_obj.data:
            raise HTTPException(400, f"SAP object '{sap_object}' not found")
        object_id = res_obj.data[0]["id"]

        # 1. Fetch Primary Data from DB
        res_data = client.table("extracted_data").select("payload").eq("project_id", project_id).eq("object_id", object_id).execute()
        if not res_data.data:
            raise HTTPException(400, "No extracted data found. Please extract and save data in Step 3 first.")

        extracted_payload = res_data.data[0]["payload"]
        if not extracted_payload:
            raise HTTPException(400, "Extracted data payload is empty.")

        primary_df = pd.DataFrame(extracted_payload)

        # 2. Fetch Primary Mappings from DB
        res_map = client.table("user_corrected_mappings").select(
            "source_field_name, transform_rule, confidence, sap_fields(sap_structure, field_name)"
        ).eq("project_id", project_id).execute()
        if not res_map.data:
            raise HTTPException(400, "No user corrected mappings found in the database for this project.")

        primary_mappings = []
        for m in res_map.data:
            sap_field = m.get("sap_fields")
            if not sap_field:
                continue
            sap_str = f"{sap_field.get('sap_structure', '')}.{sap_field.get('field_name', '')}"
            raw_src = m.get("source_field_name", "")
            clean_src = re.sub(r"^\[\d+\]", "", raw_src)
            primary_mappings.append(MappingEntry(
                src=clean_src,
                sap=sap_str,
                transform=m.get("transform_rule", "none"),
                confidence=int(m.get("confidence", 100))
            ))

        if not primary_mappings:
            raise HTTPException(400, "No valid mappings could be constructed from the database.")

        # 3. Parse Secondary file + mapping from uploads
        if not secondary_file or not secondary_file.filename:
            raise HTTPException(400, "Secondary data file is required for multi mode")
        secondary_content = await secondary_file.read()
        secondary_df = parse_data_from_upload(secondary_content, secondary_file.filename or "data.csv")

        if not secondary_mapping_file or not secondary_mapping_file.filename:
            raise HTTPException(400, "Secondary mapping file is required for multi mode")
        sm_content = await secondary_mapping_file.read()
        secondary_mappings = parse_mapping_from_upload(sm_content, secondary_mapping_file.filename or "mapping.csv")

        # 4. Run Multi-Source Agent
        result = agent.run_multi_source(
            primary_df, secondary_df, primary_mappings, secondary_mappings,
            primary_source=primary_source, secondary_source=secondary_source
        )

        # Store result for download
        session_id = str(uuid.uuid4())
        _session_store[session_id] = result.final_table

        final_rows = result.final_table.fillna("").to_dict(orient="records")
        columns = list(result.final_table.columns)

        return {
            "session_id": session_id,
            "final_table": final_rows,
            "columns": columns,
            "stats": result.stats,
            "fix_log": result.fix_log,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Multi-flow harmonization failed")
        raise HTTPException(500, f"Multi-flow harmonization failed: {str(e)}")

@router.get("/harmonize/download/{session_id}")
async def download_result(session_id: str):
    """Download the harmonized result as a CSV file."""
    if session_id not in _session_store:
        raise HTTPException(404, "Session not found. Please run harmonization again.")

    df = _session_store[session_id]
    csv_buffer = io.StringIO()
    df.to_csv(csv_buffer, index=False)
    csv_buffer.seek(0)

    return StreamingResponse(
        io.BytesIO(csv_buffer.getvalue().encode("utf-8")),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=harmonized_output.csv"},
    )


class SaveHarmonizedRequest(BaseModel):
    project_id: str
    target_object: str
    payload: list

@router.post("/harmonize/save")
def save_harmonized_data(req: SaveHarmonizedRequest):
    try:
        client = supabase_service.get_client()
        res_obj = client.table("sap_objects").select("id").ilike("name", req.target_object).execute()
        if not res_obj.data:
            raise HTTPException(400, f"SAP object '{req.target_object}' not found")
        
        obj_id = res_obj.data[0]["id"]
        
        # Delete old harmonized data if any
        client.table("harmonized_data") \
            .delete() \
            .eq("project_id", req.project_id) \
            .eq("object_id", obj_id) \
            .execute()
        
        client.table("harmonized_data").insert({
            "project_id": req.project_id,
            "object_id": obj_id,
            "payload": req.payload
        }).execute()
        
        return {"status": "success"}
    except Exception as e:
        logger.exception("Save harmonized data failed")
        raise HTTPException(500, f"Failed to save data: {str(e)}")
