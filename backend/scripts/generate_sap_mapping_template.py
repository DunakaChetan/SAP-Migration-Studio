import os
import openpyxl
from copy import copy

def generate_template():
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    data_dir = os.path.join(base_dir, "data")
    src_path = os.path.join(data_dir, "SAP_Custmor.xlsx")
    target_path = os.path.join(data_dir, "SAP_Migration_Object_Mapping_Template.xlsx")

    if not os.path.exists(src_path):
        raise FileNotFoundError(f"Source file {src_path} not found.")

    print(f"Loading source workbook from {src_path}...")
    src_wb = openpyxl.load_workbook(src_path)
    
    if "Sheet1" not in src_wb.sheetnames:
        raise ValueError("Sheet1 not found in SAP_Custmor.xlsx")
        
    src_ws = src_wb["Sheet1"]

    # Create new workbook with ONLY ONE sheet
    dst_wb = openpyxl.Workbook()
    dst_ws = dst_wb.active
    dst_ws.title = "Sheet1"

    max_col = 10  # Columns A to J

    # 1. Copy Column Dimensions from original sheet
    for col_letter, col_dimension in src_ws.column_dimensions.items():
        dst_ws.column_dimensions[col_letter].width = col_dimension.width
        dst_ws.column_dimensions[col_letter].hidden = col_dimension.hidden

    # 2. Build row mapping:
    # Block 1: Rows 1 to 27 (Header banner, column headers, General Data section, 22 general data fields)
    # Block 2: Rows 150 to 153 (Blank separator, BP roles section header, 2 BP role fields)
    # Block 3: Rows 154 to 170 (Blank separator, Additional Addresses section header, 15 address fields)
    row_map = {}
    for r in range(1, 28):
        row_map[r] = r

    dst_curr = 28
    for r in range(150, 154):
        row_map[r] = dst_curr
        dst_curr += 1

    for r in range(154, 171):
        row_map[r] = dst_curr
        dst_curr += 1

    print(f"Mapping {len(row_map)} source rows to {max(row_map.values())} destination rows...")

    # 3. Copy row heights and cell contents/styles
    for src_r, dst_r in sorted(row_map.items()):
        # Copy row height
        if src_r in src_ws.row_dimensions and src_ws.row_dimensions[src_r].height is not None:
            dst_ws.row_dimensions[dst_r].height = src_ws.row_dimensions[src_r].height

        for c in range(1, max_col + 1):
            src_cell = src_ws.cell(row=src_r, column=c)
            dst_cell = dst_ws.cell(row=dst_r, column=c)
            
            val = src_cell.value
            # Fix typo if present in source header
            if isinstance(val, str) and "mandstory" in val:
                val = val.replace("mandstory", "mandatory")
            dst_cell.value = val

            if src_cell.has_style:
                dst_cell.font = copy(src_cell.font)
                dst_cell.border = copy(src_cell.border)
                dst_cell.fill = copy(src_cell.fill)
                dst_cell.number_format = copy(src_cell.number_format)
                dst_cell.protection = copy(src_cell.protection)
                dst_cell.alignment = copy(src_cell.alignment)

    # Make top title generic and ensure Column J (10) has the same header style as Column I
    dst_ws.cell(row=1, column=1).value = "Field List for Migration Object: Standard Template"
    for r in [1, 2]:
        ref_cell = dst_ws.cell(row=r, column=9)
        j_cell = dst_ws.cell(row=r, column=10)
        j_cell.fill = copy(ref_cell.fill)
        j_cell.border = copy(ref_cell.border)

    # 4. Copy Merged Ranges accurately (remapping row coordinates)
    # Includes both horizontal merges (e.g. B5:J5) and vertical merges (e.g. C9:C12, C14:C22)
    added_merges = set()
    for m in src_ws.merged_cells.ranges:
        if m.min_row in row_map:
            new_min_r = row_map[m.min_row]
            valid_dst_rows = [row_map[r] for r in range(m.min_row, m.max_row + 1) if r in row_map]
            if not valid_dst_rows:
                continue
            new_max_r = max(valid_dst_rows)

            min_c = m.min_col
            # For row 1 and row 2 banners, expand to Column J (10) so it cleanly spans the entire table
            max_c = 10 if (m.min_row in [1, 2] and m.max_col >= 9) else m.max_col

            merge_key = (new_min_r, min_c, new_max_r, max_c)
            if merge_key not in added_merges and (new_max_r > new_min_r or max_c > min_c):
                dst_ws.merge_cells(start_row=new_min_r, start_column=min_c, end_row=new_max_r, end_column=max_c)
                added_merges.add(merge_key)

    # Save destination file
    dst_wb.save(target_path)
    print(f"Successfully generated clean template: {target_path}")
    print(f"Total rows: {dst_ws.max_row}")
    print(f"Total merged ranges: {len(dst_ws.merged_cells.ranges)}")

if __name__ == "__main__":
    generate_template()
