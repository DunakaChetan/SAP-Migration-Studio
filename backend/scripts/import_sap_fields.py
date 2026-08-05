import os
import sys
import warnings

# Suppress the Pyarrow DeprecationWarning from pandas
warnings.filterwarnings("ignore", category=DeprecationWarning, message=".*Pyarrow.*")

import pandas as pd
import numpy as np

# Add the parent directory to sys.path so we can import services
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from services.supabase_client import supabase_service

def import_fields():
    client = supabase_service.get_client()
    
    # Get Customer object ID
    res_obj = client.table("sap_objects").select("id").ilike("name", "Customer").execute()
    if not res_obj.data:
        print("Customer object not found. Creating it...")
        client.table("sap_objects").insert({"name": "Customer", "description": "SAP S/4HANA Customer Business Partner"}).execute()
        res_obj = client.table("sap_objects").select("id").ilike("name", "Customer").execute()
        
    obj_id = res_obj.data[0]["id"]
    
    # Read SAP.xlsx
    filepath = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "SAP.xlsx")
    
    print("Loading Excel file (this might take a few seconds)...")
    
    # Read all sheets
    xl = pd.ExcelFile(filepath)
    
    target_sheet = None
    header_row_index = -1
    
    for sheet_name in xl.sheet_names:
        df = pd.read_excel(filepath, sheet_name=sheet_name)
        for idx, row in df.iterrows():
            if any("SAP Field" in str(val) for val in row.values):
                header_row_index = idx
                target_sheet = sheet_name
                break
        if target_sheet:
            break
            
    if not target_sheet:
        print("Could not find header row containing 'SAP Field' in any sheet.")
        return
        
    print(f"Found headers in sheet '{target_sheet}' at row {header_row_index}")
    # Re-read with correct header row
    df = pd.read_excel(filepath, sheet_name=target_sheet, header=header_row_index + 1)
    
    # Clean column names (strip whitespace)
    df.columns = [str(c).strip() for c in df.columns]
    
    fields_to_insert = []
    seen_fields = set()
    
    current_sheet_name = ""
    current_group_name = ""
    
    # Column mapping based on screenshot
    col_sheet = "Sheet Name"
    col_group = "Group Name"
    col_desc = "Field Description"
    col_importance = "Importance"
    col_type = "Type"
    col_length = "Length"
    # The screenshot had "Decima" for Decimal
    col_decimal = "Decimal" if "Decimal" in df.columns else "Decima" if "Decima" in df.columns else None
    col_structure = "SAP Structure"
    col_field = "SAP Field"
    
    for idx, row in df.iterrows():
        # Handle forward-filling for sheet name and group name (merged cells visually)
        sheet_val = str(row.get(col_sheet, "")).strip()
        if sheet_val and sheet_val != "nan":
            current_sheet_name = sheet_val
            
        group_val = str(row.get(col_group, "")).strip()
        if group_val and group_val != "nan":
            current_group_name = group_val
            
        sap_field = str(row.get(col_field, "")).strip()
        if not sap_field or sap_field == "nan" or " " in sap_field:
            continue
            
        # Parse standard fields
        field_desc = str(row.get(col_desc, "")).strip()
        importance = str(row.get(col_importance, "")).strip()
        field_type = str(row.get(col_type, "")).strip()
        length = str(row.get(col_length, "")).strip()
        sap_structure = str(row.get(col_structure, "")).strip()
        
        decimals = ""
        if col_decimal:
            decimals = str(row.get(col_decimal, "")).strip()
            
        is_mandatory = "mandatory" in importance.lower()
        
        # Replace 'nan' with empty strings
        field_desc = "" if field_desc == "nan" else field_desc
        importance = "" if importance == "nan" else importance
        field_type = "" if field_type == "nan" else field_type
        length = "" if length == "nan" else length
        decimals = "" if decimals == "nan" else decimals
        sap_structure = "" if sap_structure == "nan" else sap_structure
        
        if (sap_structure, sap_field) not in seen_fields:
            fields_to_insert.append({
                "object_id": obj_id,
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
            seen_fields.add((sap_structure, sap_field))

    print(f"Found {len(fields_to_insert)} unique SAP fields from Excel. Inserting into Supabase...")
    
    # Delete existing fields
    client.table("sap_fields").delete().eq("object_id", obj_id).execute()
    
    # Insert in batches
    batch_size = 50
    for i in range(0, len(fields_to_insert), batch_size):
        batch = fields_to_insert[i:i+batch_size]
        client.table("sap_fields").insert(batch).execute()
        
    print("Excel Import complete!")

if __name__ == "__main__":
    import_fields()
