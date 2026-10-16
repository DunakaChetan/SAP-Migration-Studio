import pandas as pd
import os

def generate_mapping():
    # Based on the error in the screenshot, the exact required columns are:
    # Source_Field, Source_Data, Target_Data
    
    # After the Harmonization step, the Oracle field "PAYMENT_TERM"
    # will have been mapped to the SAP field "ZTERM" (or "ZTERMS").
    # We will provide transformations for the bad/old data we generated in Oracle.xlsx
    
    data = [
        {"Source_Field": "ZTERM", "Source_Data": "NT30", "Target_Data": "0014"},
        {"Source_Field": "ZTERM", "Source_Data": "nt30", "Target_Data": "0014"}, # fixing the lowercase error
        {"Source_Field": "ZTERM", "Source_Data": "0001", "Target_Data": "PT01"},
        {"Source_Field": "ZTERM", "Source_Data": "Z001", "Target_Data": "ZT01"},
        
        # We can also add transformations for the bad country names we injected
        {"Source_Field": "LAND1", "Source_Data": "Colombia", "Target_Data": "CO"},
        {"Source_Field": "LAND1", "Source_Data": "United States", "Target_Data": "US"},
        {"Source_Field": "LAND1", "Source_Data": "Germany", "Target_Data": "DE"},
        {"Source_Field": "LAND1", "Source_Data": "United Kingdom", "Target_Data": "GB"},
        {"Source_Field": "LAND1", "Source_Data": "India", "Target_Data": "IN"},
    ]
    
    df = pd.DataFrame(data)
    
    # Save the mapping file using absolute pathing
    public_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '../../public'))
    os.makedirs(public_dir, exist_ok=True)
    output_path = os.path.join(public_dir, 'Transform_Mapping.csv')
    df.to_csv(output_path, index=False)
    print(f"Successfully generated mapping file with required columns: {output_path}")

if __name__ == '__main__':
    generate_mapping()
