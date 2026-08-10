import io
import csv
import logging
from typing import Dict, List, Any

from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from fastapi.responses import Response
from pydantic import BaseModel
import pandas as pd

from services.supabase_client import supabase_service
from agents.validation_agent import ValidationAgent, gen_customer_rows, OBJS, RULES

logger = logging.getLogger(__name__)

router = APIRouter()

agent = ValidationAgent()

class ValidateFlowRequest(BaseModel):
    project_id: str
    target_object: str

@router.get("/validate/health")
def health():
    return {"status": "ok", "service": "validate", "objects": list(OBJS.keys()), "rules": [r["id"] for r in RULES]}

@router.post("/validate/flow")
def validate_flow(req: ValidateFlowRequest):
    try:
        client = supabase_service.get_client()

        # Get object_id
        res_obj = client.table("sap_objects").select("id").ilike("name", req.target_object).execute()
        if not res_obj.data:
            raise HTTPException(400, f"SAP object '{req.target_object}' not found")
        object_id = res_obj.data[0]["id"]

        # Fetch Harmonized Data from DB
        # Order by created_at desc, limit 1 to get the most recent harmonization result
        res_data = client.table("harmonized_data").select("payload").eq("project_id", req.project_id).eq("object_id", object_id).order("created_at", desc=True).limit(1).execute()
        if not res_data.data:
            raise HTTPException(400, "No harmonized data found for this project and object in the database.")
        
        harmonized_payload = res_data.data[0]["payload"]
        if not harmonized_payload:
            raise HTTPException(400, "Harmonized data payload is empty.")

        return agent.run_validation(req.target_object.upper(), harmonized_payload)

    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Validation flow failed")
        raise HTTPException(500, f"Validation flow failed: {str(e)}")

@router.post("/validate/upload-csv")
async def validate_upload(obj: str = Form(...), file: UploadFile = File(...)):
    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="Only .csv files are supported.")

    content = await file.read()
    try:
        df = pd.read_csv(io.BytesIO(content), dtype=str, keep_default_na=False)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to parse CSV: {e}")

    rows = df.to_dict(orient="records")
    if not rows:
        raise HTTPException(status_code=400, detail="CSV file is empty.")

    result = agent.run_validation(obj, rows)
    result["headers"] = list(df.columns)
    result["rows"] = rows
    result["filename"] = file.filename
    return result

def _rows_to_csv(rows: List[Dict[str, str]], cols: List[str]) -> str:
    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=cols, extrasaction="ignore")
    writer.writeheader()
    for r in rows:
        writer.writerow(r)
    return buf.getvalue()

@router.get("/validate/sample-csv")
def sample_csv(obj: str = "CUSTOMER", count: int = 200):
    if obj != "CUSTOMER":
        raise HTTPException(status_code=400, detail="Sample generation currently only supports obj=CUSTOMER.")
    if count < 1 or count > 5000:
        raise HTTPException(status_code=400, detail="count must be between 1 and 5000.")

    rows = gen_customer_rows(count)
    cols = [f["n"] for f in OBJS["CUSTOMER"]]
    csv_text = _rows_to_csv(rows, cols)
    filename = f"sample_customer_{count}_with_errors.csv"

    return Response(
        content=csv_text,
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )

class SaveValidationRequest(BaseModel):
    project_id: str
    target_object: str
    payload: list

@router.post("/validate/save")
def save_validation(req: SaveValidationRequest):
    try:
        client = supabase_service.get_client()
        # Resolve target_object name to object_id
        res_obj = client.table("sap_objects").select("id").ilike("name", req.target_object).execute()
        if not res_obj.data:
            raise HTTPException(status_code=400, detail=f"SAP object '{req.target_object}' not found.")
        object_id = res_obj.data[0]["id"]
        
        # Delete old validation if any
        client.table("validation_report") \
            .delete() \
            .eq("project_id", req.project_id) \
            .eq("object_id", object_id) \
            .execute()
            
        # Insert the new payload
        res = client.table("validation_report").insert({
            "project_id": req.project_id,
            "object_id": object_id,
            "payload": req.payload
        }).execute()
        
        return {"status": "success", "message": "Validation saved to database."}
    except Exception as e:
        logger.error(f"Failed to save validation: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to save validation: {str(e)}")
