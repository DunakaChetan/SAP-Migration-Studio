import os
from pathlib import Path
from tempfile import TemporaryDirectory
import pandas as pd
import json

from fastapi import APIRouter, File, HTTPException, UploadFile, Form
from pydantic import BaseModel

from agents.cleanser_agent import run_cleanser
from services.supabase_client import supabase_service

router = APIRouter()

class FlowRequest(BaseModel):
    project_id: str
    target_object: str

class SaveRequest(BaseModel):
    project_id: str
    target_object: str
    payload: list

def parse_cleaned_csv(csv_path: Path):
    df = pd.read_csv(csv_path, dtype=str, keep_default_na=False)
    # Convert all possible NaN to empty string just to be safe
    df = df.fillna("")
    return df.to_dict(orient="records")

@router.post("/flow")
async def cleanser_flow(req: FlowRequest):
    client = supabase_service.get_client()
    
    # 1. Fetch Object ID
    res_obj = client.table("sap_objects").select("id").ilike("name", req.target_object).execute()
    if not res_obj.data:
        raise HTTPException(status_code=400, detail="Target object not found")
    object_id = res_obj.data[0]["id"]
    
    # 2. Fetch Harmonized Data
    res_harm = client.table("harmonized_data").select("payload").eq("project_id", req.project_id).eq("object_id", object_id).order("created_at", desc=True).limit(1).execute()
    if not res_harm.data:
        raise HTTPException(status_code=400, detail="No harmonized data found for this project/object")
    harmonized_data = res_harm.data[0]["payload"]
    
    # 3. Fetch Validation Report
    res_val = client.table("validation_report").select("payload").eq("project_id", req.project_id).eq("object_id", object_id).order("created_at", desc=True).limit(1).execute()
    validation_payload = res_val.data[0]["payload"] if res_val.data else []
    
    # Convert validation payload to format expected by cleanser agent CSV
    agent_issues = [["Row Number", "Rule Code", "Field Name"]]
    for issue in validation_payload:
        agent_issues.append([
            str(issue.get("row_number", "")),
            issue.get("rule_code", ""),
            issue.get("field_name", "")
        ])

    with TemporaryDirectory(prefix="sap_cleanser_") as tmp_dir:
        tmp_path = Path(tmp_dir)
        input_csv_path = tmp_path / "harmonization.csv"
        validation_csv_path = tmp_path / "validation_report.csv"
        output_csv_path = tmp_path / "cleaned.csv"

        # Write data to CSV
        df = pd.DataFrame(harmonized_data)
        df.to_csv(input_csv_path, index=False)
        
        # Write validation report
        with open(validation_csv_path, "w", encoding="utf-8", newline="") as f:
            import csv
            writer = csv.writer(f)
            writer.writerows(agent_issues)

        try:
            summary = run_cleanser(
                dataset_csv_path=input_csv_path,
                validation_report_csv_path=validation_csv_path,
                output_csv_path=output_csv_path,
            )
            cleaned_data = parse_cleaned_csv(output_csv_path)
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"Cleanser failed: {exc}") from exc

    return {
        "success": True,
        "summary": summary,
        "cleaned": cleaned_data,
    }


@router.post("/upload-csv")
async def cleanser_upload_csv(
    harmonization_csv: UploadFile = File(...),
    validation_report_csv: UploadFile | None = File(None),
):
    if not harmonization_csv.filename:
        raise HTTPException(status_code=400, detail="harmonization_csv is required")

    with TemporaryDirectory(prefix="sap_cleanser_") as tmp_dir:
        tmp_path = Path(tmp_dir)
        input_csv_path = tmp_path / "harmonization.csv"
        validation_csv_path = tmp_path / "validation_report.csv"
        output_csv_path = tmp_path / "cleaned.csv"

        input_csv_path.write_bytes(await harmonization_csv.read())

        report_path: Path | None = None
        if validation_report_csv and validation_report_csv.filename:
            validation_csv_path.write_bytes(await validation_report_csv.read())
            report_path = validation_csv_path

        try:
            summary = run_cleanser(
                dataset_csv_path=input_csv_path,
                validation_report_csv_path=report_path,
                output_csv_path=output_csv_path,
            )
            cleaned_data = parse_cleaned_csv(output_csv_path)
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"Cleanser failed: {exc}") from exc

    return {
        "success": True,
        "summary": summary,
        "cleaned": cleaned_data,
    }


@router.post("/save")
async def cleanser_save(req: SaveRequest):
    client = supabase_service.get_client()
    try:
        # Fetch Object ID
        res_obj = client.table("sap_objects").select("id").ilike("name", req.target_object).execute()
        if not res_obj.data:
            raise HTTPException(status_code=400, detail="Target object not found")
        object_id = res_obj.data[0]["id"]
        
        # Delete old
        client.table("cleansed_data") \
            .delete() \
            .eq("project_id", req.project_id) \
            .eq("object_id", object_id) \
            .execute()
            
        # Insert new
        res = client.table("cleansed_data").insert({
            "project_id": req.project_id,
            "object_id": object_id,
            "payload": req.payload
        }).execute()
        
        return {"success": True, "inserted": len(req.payload)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
