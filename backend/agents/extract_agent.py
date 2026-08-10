import json
import logging
import requests
import pandas as pd
from services.llm_orchestrator import llm_orchestrator
import urllib3

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

logger = logging.getLogger(__name__)

class ExtractAgent:
    def perform_extraction(self, base_url, client, username, password, target_object, mappings):
        # 1. Build dynamic $select OData query
        source_fields = set()
        for m in mappings:
            if m.get('src'):
                parts = m['src'].split('.')
                field = parts[-1] if len(parts) > 1 else m['src']
                source_fields.add(field)

        if not source_fields:
            raise ValueError("No valid source fields found in mapping.")

        select_query = ",".join(source_fields)
        
        base_url = base_url.rstrip('/')
        if target_object in ['CUSTOMER', 'VENDOR', 'Customer', 'Vendor']:
            api_path = f"/sap/opu/odata/sap/API_BUSINESS_PARTNER/A_BusinessPartner?$select={select_query}&$top=1000"
        elif target_object in ['MATERIAL', 'Material']:
            api_path = f"/sap/opu/odata/sap/API_PRODUCT_SRV/A_Product?$select={select_query}&$top=1000"
        else:
            raise ValueError(f"Unsupported target object: {target_object}")

        fetch_url = f"{base_url}{api_path}"
        if client:
            fetch_url += f"&sap-client={client}"

        # 2. Fetch Live Data
        session = requests.Session()
        session.trust_env = False
        
        print(f"Executing extraction: {fetch_url}")
        res = session.get(
            fetch_url,
            auth=(username, password),
            headers={"Accept": "application/json"},
            timeout=30,
            verify=False
        )

        if res.status_code != 200:
            raise Exception(f"Failed to fetch data from SAP: {res.status_code} {res.text[:200]}")

        data = res.json()
        results = data.get("d", {}).get("results", [])

        # 3. Apply Transformations
        harmonized_results = []
        for row in results:
            harmonized_row = {}
            for m in mappings:
                src_full = m.get('src')
                if not src_full:
                    continue
                
                parts = src_full.split('.')
                src_key = parts[-1] if len(parts) > 1 else src_full
                
                sap_key = m.get('sap')
                transform = m.get('tr', 'none')
                
                raw_val = row.get(src_key, "")
                if isinstance(raw_val, dict):
                    raw_val = ""
                elif raw_val is None:
                    raw_val = ""
                else:
                    raw_val = str(raw_val)

                if transform == 'trim':
                    val = raw_val.strip()
                elif transform == 'upper':
                    val = raw_val.upper()
                elif transform == 'pad10':
                    val = raw_val.zfill(10) if raw_val.isdigit() else raw_val
                elif transform == 'country' or transform == 'currency':
                    val = raw_val.strip().upper()
                else:
                    val = raw_val
                
                harmonized_row[src_full] = val
                
            harmonized_results.append(harmonized_row)

        return harmonized_results

    def generate_eda_quality_report(self, harmonized_results, target_object):
        if not harmonized_results:
            return "No data extracted for analysis."
            
        # 1. Python EDA Analysis using pandas
        df = pd.DataFrame(harmonized_results)
        
        total_rows = len(df)
        eda_stats = []
        
        for col in df.columns:
            series = df[col]
            series = series.replace(r'^\s*$', pd.NA, regex=True)
            
            null_count = series.isna().sum()
            null_pct = (null_count / total_rows) * 100
            unique_count = series.nunique()
            
            # Max length
            lengths = series.dropna().astype(str).map(len)
            max_len = lengths.max() if not lengths.empty else 0
                
            eda_stats.append({
                "field": col,
                "null_percentage": round(float(null_pct), 1),
                "unique_count": int(unique_count),
                "max_length": int(max_len)
            })

        eda_summary_json = json.dumps({
            "total_records": total_rows,
            "field_statistics": eda_stats
        }, indent=2)
        
        # 2. AI Executive Summary Generation
        prompt = f"""You are a Lead Data Migration Architect for SAP S/4HANA.
I have run an Exploratory Data Analysis (EDA) on an extracted payload for {target_object}.
Here are the mathematical statistics computed via Python Pandas:

{eda_summary_json}

Based on these statistics, generate a highly professional 'Executive Data Quality Report'.
You MUST return the output as a valid JSON object matching this exact schema:
{{
  "report_title": "String",
  "executive_summary": "String (1-2 paragraphs analyzing the overall health)",
  "critical_warnings": ["String array of major issues (e.g., high nulls on mandatory fields)"],
  "recommendations": ["String array of 3-5 concrete action items before harmonization"]
}}
"""
        try:
            report_str = llm_orchestrator.generate_generic(system_prompt="You are a SAP Expert. Always return valid JSON.", user_prompt=prompt)
            # Remove any markdown codeblocks if llm_orchestrator wrapped it
            if report_str.startswith("```json"):
                report_str = report_str[7:].rstrip("`\n")
            elif report_str.startswith("```"):
                report_str = report_str[3:].rstrip("`\n")
                
            report_json = json.loads(report_str)
            
            return {
                "eda_stats": eda_stats,
                "ai_report": report_json
            }
        except Exception as e:
            logger.error(f"Failed to generate LLM report: {e}")
            return {
                "eda_stats": eda_stats,
                "ai_report": {
                    "report_title": "Data Quality Analysis Failed",
                    "executive_summary": f"EDA Analysis completed but AI Narrative generation failed: {str(e)}",
                    "critical_warnings": [],
                    "recommendations": []
                }
            }
