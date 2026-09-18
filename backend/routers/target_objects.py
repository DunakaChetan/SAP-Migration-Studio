import os
import io
import re
import logging
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from fastapi.responses import StreamingResponse, JSONResponse
from pydantic import BaseModel
import pandas as pd

from scripts.import_sap_fields import (
    get_excel_sheet_names,
    parse_excel_sheet_to_fields,
    upsert_fields_to_supabase
)

logger = logging.getLogger(__name__)

router = APIRouter()

class ConfirmImportRequest(BaseModel):
    object_name: str
    description: Optional[str] = ""
    fields: List[Dict[str, Any]]

# ══════════════════════════════════════════════════════════════════
# 1. Download Standard Sample Template Excel File
# ══════════════════════════════════════════════════════════════════
@router.get("/template")
def download_sample_template():
    """
    Downloads the official single-tab SAP Migration Object Mapping Template (.xlsx)
    containing authentic SAP Cockpit structure and mock data.
    """
    try:
        base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        template_path = os.path.join(base_dir, "data", "SAP_Migration_Object_Mapping_Template.xlsx")
        
        if not os.path.exists(template_path):
            raise HTTPException(status_code=404, detail="Template file not found on server.")

        filename = "SAP_Migration_Object_Mapping_Template.xlsx"
        
        def iterfile():
            with open(template_path, mode="rb") as f:
                yield from f

        return StreamingResponse(
            iterfile(),
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'}
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error serving template Excel: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to download template: {str(e)}")


# ══════════════════════════════════════════════════════════════════
# 2. Validate Uploaded Target Object Fields Excel Sheet
# ══════════════════════════════════════════════════════════════════
@router.post("/validate-sheet")
async def validate_target_object_sheet(
    file: UploadFile = File(...),
    selected_sheet: Optional[str] = Form(None)
):
    """
    Validates an uploaded Excel workbook or CSV for target field definitions.
    - Inspects all sheet/tab names in the workbook.
    - If `selected_sheet` is provided, parses that specific tab.
    - If `selected_sheet` is empty, auto-discovers the candidate sheet.
    - Supports both 10-column SAP Migration Cockpit and 6-column generic schema formats.
    """
    filename = file.filename or ""
    lower_fname = filename.lower()
    if not lower_fname.endswith((".xlsx", ".xls", ".csv")):
        return JSONResponse(
            status_code=400,
            content={
                "valid": False,
                "error": "Invalid file format. Please upload an Excel spreadsheet (.xlsx, .xls) or CSV file."
            }
        )

    try:
        content = await file.read()
        if not content:
            return JSONResponse(
                status_code=400,
                content={"valid": False, "error": "The uploaded file is empty (0 bytes)."}
            )

        # 1. Discover all sheets in the workbook
        sheet_names: List[str] = []
        try:
            sheet_names = get_excel_sheet_names(content)
        except Exception as e:
            logger.warning(f"Could not read sheet names with openpyxl/pandas: {e}")
            sheet_names = ["Sheet1"]

        # 2. Parse candidate sheet
        target_sheet, header_row, fields = parse_excel_sheet_to_fields(content, sheet_name=selected_sheet)

        # If user explicitly requested a sheet but it had no valid fields
        if not fields:
            active_sheet = selected_sheet or (sheet_names[0] if sheet_names else "Uploaded Sheet")
            return JSONResponse(
                status_code=400,
                content={
                    "valid": False,
                    "sheet_names": sheet_names,
                    "selected_sheet": active_sheet,
                    "error": (
                        f"The selected tab '{active_sheet}' does not contain standard SAP Migration Cockpit "
                        f"or Target Object field definitions. Please select the tab containing the field specifications "
                        f"from the available tabs above."
                    ),
                    "required_columns": [
                        "SAP Field", "SAP Structure", "Field Description", "Type", "Importance"
                    ]
                }
            )

        # 3. Derive suggested object name
        clean_stem = re.sub(r"\.[^.]+$", "", filename)
        clean_stem = re.sub(r"^(SAP_|Oracle_EBS_to_SAP_S4HANA_|SF_)", "", clean_stem, flags=re.IGNORECASE)
        clean_stem = re.sub(r"[_\-]+", " ", clean_stem).strip()
        
        # Get unique structures
        structures = list(dict.fromkeys(f.get("sap_structure", "") for f in fields if f.get("sap_structure")))
        detected_table = structures[0] if structures else "Target Object"
        suggested_name = clean_stem.title() if clean_stem and not clean_stem.lower().startswith("sheet") else detected_table

        mandatory_count = sum(1 for f in fields if f.get("is_mandatory"))

        return {
            "valid": True,
            "sheet_names": sheet_names,
            "selected_sheet": target_sheet,
            "detected_header_row": header_row,
            "detected_table_name": detected_table,
            "suggested_object_name": suggested_name,
            "structures": structures,
            "total_fields": len(fields),
            "mandatory_count": mandatory_count,
            "preview": fields[:15],
            "fields": fields,
            "detected_mappings": {
                "structure_source": "SAP Structure Column",
                "field_column": "SAP Field (Technical Identifier)",
                "label_column": "Field Description",
                "type_column": "Type & Length",
                "required_column": "Importance (Mandatory Flag)"
            }
        }

    except Exception as e:
        logger.error(f"Error validating target object sheet: {e}", exc_info=True)
        return JSONResponse(
            status_code=500,
            content={"valid": False, "error": f"Failed to process sheet: {str(e)}"}
        )


# ══════════════════════════════════════════════════════════════════
# 3. Confirm & Safe Import into Supabase (Upsert / Merge)
# ══════════════════════════════════════════════════════════════════
@router.post("/confirm-import")
def confirm_import_target_object(req: ConfirmImportRequest):
    """
    Creates/updates the target object in `sap_objects` and safely upserts
    field specifications into `sap_fields`. Preserves foreign keys and mappings!
    """
    if not req.object_name or not req.object_name.strip():
        raise HTTPException(status_code=400, detail="Target Object Name is required.")

    if not req.fields:
        raise HTTPException(status_code=400, detail="No field definitions provided for import.")

    try:
        res = upsert_fields_to_supabase(
            object_name=req.object_name.strip(),
            description=(req.description or "").strip(),
            fields=req.fields
        )

        msg = (
            f"Successfully processed {res['total_fields']} fields for target object '{res['object_name']}': "
            f"{res['new_fields']} new fields added, {res['updated_fields']} existing fields updated."
        )

        return {
            "status": "success",
            "message": msg,
            "object_id": res["object_id"],
            "object_name": res["object_name"],
            "total_fields": res["total_fields"],
            "new_fields": res["new_fields"],
            "updated_fields": res["updated_fields"],
            "mandatory_count": res["mandatory_count"]
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to confirm target object import: {e}")
        raise HTTPException(status_code=500, detail=f"Database import failed: {str(e)}")
