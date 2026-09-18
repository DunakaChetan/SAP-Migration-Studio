import os
import io
import sys
import re
import warnings
from typing import List, Dict, Any, Tuple, Optional, Union

# Suppress the Pyarrow DeprecationWarning from pandas
warnings.filterwarnings("ignore", category=DeprecationWarning, message=".*Pyarrow.*")

import pandas as pd
import numpy as np

# Add the parent directory to sys.path so we can import services
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from services.supabase_client import supabase_service


def get_excel_sheet_names(file_source: Union[str, bytes, io.BytesIO]) -> List[str]:
    """Returns the list of sheet names in an Excel workbook."""
    if isinstance(file_source, bytes):
        file_source = io.BytesIO(file_source)
    xl = pd.ExcelFile(file_source)
    return list(xl.sheet_names)


def parse_excel_sheet_to_fields(
    file_source: Union[str, bytes, io.BytesIO],
    sheet_name: Optional[str] = None
) -> Tuple[str, int, List[Dict[str, Any]]]:
    """
    Parses an Excel sheet into standardized SAP field definitions.
    Supports:
    1. Standard SAP Migration Cockpit 10-column layout:
       (Sheet Name, Group Name, Field Description, Importance, Type, Length, Decimal, SAP Structure, SAP Field)
    2. Standard 6-column target layout:
       (Table Name, Field Name, LABEL, TYPE, SAP REQUIRED, Enabled)
       
    Returns:
        Tuple of (target_sheet_name, header_row_index, list_of_field_dicts)
    """
    if isinstance(file_source, bytes):
        file_source = io.BytesIO(file_source)

    xl = pd.ExcelFile(file_source)
    candidate_sheets = [sheet_name] if (sheet_name and sheet_name in xl.sheet_names) else xl.sheet_names

    target_sheet = None
    header_row_index = -1
    matched_layout = None  # 'cockpit' or 'standard_6'

    for s in candidate_sheets:
        try:
            # Scan top 20 rows for genuine schema header indicator
            df_raw = pd.read_excel(file_source, sheet_name=s, header=None, nrows=20)
            for idx, row in df_raw.iterrows():
                row_str_vals = [str(val).strip() for val in row.values if pd.notna(val)]
                row_lower = [v.lower() for v in row_str_vals]

                # Disqualify ETL / Source-to-Target mapping matrix sheets
                is_mapping_sheet = any(
                    any(kw in v for kw in ["oracle column", "oracle table", "source column", "source table", "transformation", "legacy field"])
                    for v in row_lower
                )
                if is_mapping_sheet:
                    continue

                # 1. Strict check for SAP Cockpit format:
                # Must contain: (SAP Field) AND (SAP Structure or Structure) AND (Field Description or Description)
                has_field = any("sap field" in v or "sap-feld" in v for v in row_lower)
                has_structure = any("sap structure" in v or v == "structure" for v in row_lower)
                has_desc = any("field description" in v or v == "description" for v in row_lower)

                if has_field and (has_structure or has_desc):
                    header_row_index = idx
                    target_sheet = s
                    matched_layout = "cockpit"
                    break

                # 2. Strict check for Standard 6-column target layout:
                norm_vals = [re.sub(r"[^a-z0-9]", "", v) for v in row_lower]
                has_tech_field = "fieldname" in norm_vals or "technicalname" in norm_vals or "targetfield" in norm_vals
                has_lbl = "label" in norm_vals or "fieldlabel" in norm_vals or "description" in norm_vals
                has_dt = "type" in norm_vals or "datatype" in norm_vals or "fieldtype" in norm_vals

                if has_tech_field and has_lbl and has_dt:
                    header_row_index = idx
                    target_sheet = s
                    matched_layout = "standard_6"
                    break

            if target_sheet:
                break
        except Exception:
            continue

    if not target_sheet or header_row_index < 0:
        return ("", -1, [])

    # Read sheet with detected header row
    if isinstance(file_source, io.BytesIO):
        file_source.seek(0)

    df = pd.read_excel(file_source, sheet_name=target_sheet, header=header_row_index)
    df.columns = [str(c).strip() for c in df.columns]
    cols_lower = [c.lower() for c in df.columns]

    # Additional strict safeguard: if essential columns do not actually exist in df.columns, reject
    if matched_layout == "cockpit":
        col_field = next((c for c in df.columns if "sap field" in c.lower() or c.lower() == "field"), None)
        col_structure = next((c for c in df.columns if "sap structure" in c.lower() or "structure" in c.lower()), None)
        col_desc = next((c for c in df.columns if "field description" in c.lower() or "description" in c.lower()), None)

        if not col_field or (not col_structure and not col_desc):
            return ("", -1, [])

        col_sheet = next((c for c in df.columns if "sheet name" in c.lower() or c.lower() == "sheet"), None)
        col_group = next((c for c in df.columns if "group name" in c.lower() or c.lower() == "group"), None)
        col_importance = next((c for c in df.columns if "importance" in c.lower() or "required" in c.lower()), None)
        col_type = next((c for c in df.columns if c.lower() == "type" or "data type" in c.lower()), None)
        col_length = next((c for c in df.columns if "length" in c.lower()), None)
        col_decimal = next((c for c in df.columns if "decim" in c.lower()), None)

        current_sheet_name = target_sheet
        current_group_name = ""
        fields: List[Dict[str, Any]] = []

        for _, row in df.iterrows():
            if col_sheet:
                sheet_val = str(row.get(col_sheet, "")).strip()
                if sheet_val and sheet_val.lower() not in ["nan", "none", "null"]:
                    current_sheet_name = sheet_val

            if col_group:
                group_val = str(row.get(col_group, "")).strip()
                if group_val and group_val.lower() not in ["nan", "none", "null"]:
                    current_group_name = group_val

            sap_field = str(row.get(col_field, "")).strip()
            if not sap_field or sap_field.lower() in ["nan", "none", "null", "sap field"] or " " in sap_field:
                continue

            field_desc = str(row.get(col_desc, "")).strip() if col_desc else ""
            importance = str(row.get(col_importance, "")).strip() if col_importance else ""
            field_type = str(row.get(col_type, "")).strip() if col_type else "Text"
            length = str(row.get(col_length, "")).strip() if col_length else ""
            sap_structure = str(row.get(col_structure, "")).strip() if col_structure else target_sheet

            decimals = ""
            if col_decimal:
                decimals = str(row.get(col_decimal, "")).strip()

            is_mandatory = "mandatory" in importance.lower() or "required" in importance.lower() or importance.lower() in ["true", "x", "yes", "1"]

            field_desc = "" if field_desc.lower() == "nan" else field_desc
            field_type = "Text" if field_type.lower() in ["nan", ""] else field_type
            length = "" if length.lower() == "nan" else length
            decimals = "" if decimals.lower() == "nan" else decimals
            sap_structure = target_sheet if sap_structure.lower() in ["nan", ""] else sap_structure

            fields.append({
                "sheet_name": current_sheet_name,
                "group_name": current_group_name,
                "field_description": field_desc,
                "type": field_type,
                "length": length,
                "decimals": decimals,
                "sap_structure": sap_structure,
                "field_name": sap_field,
                "is_mandatory": is_mandatory
            })

        # Require that at least 40% of the parsed fields have valid descriptions
        desc_count = sum(1 for f in fields if f.get("field_description"))
        if len(fields) == 0 or (desc_count / len(fields) < 0.40):
            return ("", -1, [])


    else:
        # Standard 6-column layout
        col_norm = {re.sub(r"[^a-z0-9]", "", c.lower()): c for c in df.columns}
        c_field = col_norm.get("fieldname") or col_norm.get("field") or col_norm.get("technicalname") or "Field Name"
        c_table = col_norm.get("tablename") or col_norm.get("structure") or col_norm.get("table") or "Table Name"
        c_label = col_norm.get("label") or col_norm.get("description") or "LABEL"
        c_type = col_norm.get("type") or col_norm.get("datatype") or "TYPE"
        c_req = col_norm.get("saprequired") or col_norm.get("required") or col_norm.get("mandatory") or "SAP REQUIRED"

        for _, row in df.iterrows():
            f_name = str(row.get(c_field, "")).strip()
            if not f_name or f_name.lower() in ["nan", "none", "null", "field name"]:
                continue

            tbl = str(row.get(c_table, "")).strip() if c_table in df.columns else target_sheet
            tbl = target_sheet if not tbl or tbl.lower() in ["nan", "none"] else tbl

            lbl = str(row.get(c_label, "")).strip() if c_label in df.columns else f_name
            lbl = f_name if not lbl or lbl.lower() in ["nan", "none"] else lbl

            t_val = str(row.get(c_type, "String")).strip() if c_type in df.columns else "String"
            t_val = "String" if not t_val or t_val.lower() in ["nan", "none"] else t_val

            req_val = str(row.get(c_req, "")).strip().lower() if c_req in df.columns else ""
            is_mand = req_val in ["true", "1", "yes", "mandatory", "required", "x"]

            fields.append({
                "sheet_name": target_sheet,
                "group_name": tbl,
                "field_description": lbl,
                "type": t_val,
                "length": "",
                "decimals": "",
                "sap_structure": tbl,
                "field_name": f_name,
                "is_mandatory": is_mand
            })

    return (target_sheet, header_row_index, fields)


def upsert_fields_to_supabase(
    object_name: str,
    description: str,
    fields: List[Dict[str, Any]],
    client=None
) -> Dict[str, Any]:
    """
    Safely creates/updates sap_objects and batch upserts fields into sap_fields.
    Preserves existing field UUIDs so foreign keys in field_mappings are NEVER broken!
    """
    if client is None:
        client = supabase_service.get_client()

    clean_obj_name = object_name.strip()
    clean_desc = (description or "").strip() or clean_obj_name

    # 1. Get or Create sap_objects entry
    res_obj = client.table("sap_objects").select("id, name").ilike("name", clean_obj_name).execute()
    if res_obj.data and len(res_obj.data) > 0:
        obj_id = res_obj.data[0]["id"]
        try:
            client.table("sap_objects").update({"description": clean_desc}).eq("id", obj_id).execute()
        except Exception:
            pass
    else:
        ins_obj = client.table("sap_objects").insert({"name": clean_obj_name, "description": clean_desc}).execute()
        if not ins_obj.data:
            raise RuntimeError(f"Failed to create target object '{clean_obj_name}' in database.")
        obj_id = ins_obj.data[0]["id"]

    # 2. Fetch existing fields for this object to calculate new vs updated counts
    existing_res = client.table("sap_fields").select("sap_structure, field_name").eq("object_id", obj_id).execute()
    existing_keys = {
        (str(r.get("sap_structure", "")).strip(), str(r.get("field_name", "")).strip())
        for r in (existing_res.data or [])
    }

    # 3. Deduplicate and format fields
    seen = set()
    fields_to_upsert = []
    new_count = 0
    updated_count = 0

    for f in fields:
        structure = str(f.get("sap_structure") or clean_obj_name).strip()
        field_name = str(f.get("field_name") or "").strip()
        if not field_name:
            continue

        key = (structure, field_name)
        if key in seen:
            continue
        seen.add(key)

        if key in existing_keys:
            updated_count += 1
        else:
            new_count += 1

        fields_to_upsert.append({
            "object_id": obj_id,
            "sheet_name": str(f.get("sheet_name") or "Sheet1").strip(),
            "group_name": str(f.get("group_name") or clean_obj_name).strip(),
            "field_description": str(f.get("field_description") or field_name).strip(),
            "type": str(f.get("type") or "Text").strip(),
            "length": str(f.get("length") or "").strip(),
            "decimals": str(f.get("decimals") or "").strip(),
            "sap_structure": structure,
            "field_name": field_name,
            "is_mandatory": bool(f.get("is_mandatory", False))
        })

    # 4. Batch upsert into sap_fields on conflict (object_id, sap_structure, field_name)
    batch_size = 50
    inserted_total = 0

    for i in range(0, len(fields_to_upsert), batch_size):
        batch = fields_to_upsert[i : i + batch_size]
        try:
            client.table("sap_fields").upsert(batch, on_conflict="object_id,sap_structure,field_name").execute()
            inserted_total += len(batch)
        except Exception as upsert_err:
            print(f"Upsert on_conflict failed, trying insert: {upsert_err}")
            try:
                client.table("sap_fields").insert(batch).execute()
                inserted_total += len(batch)
            except Exception as ins_err:
                print(f"Insert batch error: {ins_err}")

    return {
        "status": "success",
        "object_id": obj_id,
        "object_name": clean_obj_name,
        "total_fields": inserted_total,
        "new_fields": new_count,
        "updated_fields": updated_count,
        "mandatory_count": sum(1 for f in fields_to_upsert if f["is_mandatory"])
    }


def import_fields():
    """CLI execution preserving original script functionality."""
    client = supabase_service.get_client()
    data_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data")
    
    files_to_process = [
        {"filename": "SAP_Custmor.xlsx", "object_name": "Customer", "desc": "SAP S/4HANA Customer Business Partner"},
        {"filename": "SAP_Vendor.xlsx", "object_name": "Vendor", "desc": "SAP S/4HANA Vendor Business Partner"},
        {"filename": "SAP_Material.xlsx", "object_name": "Material", "desc": "SAP S/4HANA Material Master"}
    ]
    
    for file_info in files_to_process:
        filepath = os.path.join(data_dir, file_info["filename"])
        if not os.path.exists(filepath):
            print(f"Skipping {file_info['filename']} - File not found.")
            continue
            
        print(f"\n--- Processing {file_info['filename']} for object '{file_info['object_name']}' ---")
        sheet_name, row_idx, fields = parse_excel_sheet_to_fields(filepath)
        if not fields:
            print(f"Could not parse valid fields from {file_info['filename']}.")
            continue
            
        print(f"Found {len(fields)} fields in sheet '{sheet_name}' (row {row_idx}). Upserting to Supabase...")
        res = upsert_fields_to_supabase(file_info["object_name"], file_info["desc"], fields, client=client)
        print(f"Successfully processed {file_info['object_name']}: {res['new_fields']} new, {res['updated_fields']} updated.")

    print("\nAll imports completed!")


if __name__ == "__main__":
    import_fields()
