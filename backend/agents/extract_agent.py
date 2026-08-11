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
        total_null_pct = 0.0
        healthy_count = 0
        warning_count = 0
        critical_count = 0
        
        for col in df.columns:
            series = df[col]
            series = series.replace(r'^\s*$', pd.NA, regex=True)
            
            null_count = int(series.isna().sum())
            null_pct = round((null_count / total_rows) * 100, 1) if total_rows > 0 else 0.0
            unique_count = int(series.nunique())
            
            lengths = series.dropna().astype(str).map(len)
            max_len = int(lengths.max()) if not lengths.empty else 0
            
            status = "HEALTHY" if null_pct <= 10 else ("WARNING" if null_pct <= 50 else "CRITICAL")
            if status == "HEALTHY":
                healthy_count += 1
            elif status == "WARNING":
                warning_count += 1
            else:
                critical_count += 1
                
            total_null_pct += null_pct
                
            eda_stats.append({
                "field": col,
                "null_count": null_count,
                "null_percentage": null_pct,
                "completeness_pct": round(100.0 - null_pct, 1),
                "unique_count": unique_count,
                "max_length": max_len,
                "status": status
            })

        num_fields = max(len(eda_stats), 1)
        avg_completeness = round(100.0 - (total_null_pct / num_fields), 1)
        calculated_score = max(0, min(100, int(avg_completeness)))
        
        if calculated_score >= 90:
            calculated_grade = "A"
        elif calculated_score >= 75:
            calculated_grade = "B"
        elif calculated_score >= 60:
            calculated_grade = "C"
        else:
            calculated_grade = "D"

        eda_summary_json = json.dumps({
            "total_records": total_rows,
            "total_fields": num_fields,
            "calculated_score": calculated_score,
            "field_health_distribution": {
                "healthy_fields": healthy_count,
                "warning_fields": warning_count,
                "critical_fields": critical_count
            },
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
  "report_title": "Executive Data Quality Report: {target_object} Master Data for S/4HANA Migration",
  "overall_score": {calculated_score},
  "health_grade": "{calculated_grade}",
  "executive_summary": "String (1-2 clear, executive-ready paragraphs analyzing overall health and migration readiness)",
  "critical_warnings": ["String array of 2-4 major issues with specific field names and percentages"],
  "recommendations": ["String array of 3-5 concrete action items formatted as 'Title: Description'"]
}}
"""
        try:
            report_str = llm_orchestrator.generate_generic(system_prompt="You are a SAP Data Migration Architect Expert. Always return valid JSON.", user_prompt=prompt)
            if report_str.startswith("```json"):
                report_str = report_str[7:].rstrip("`\n")
            elif report_str.startswith("```"):
                report_str = report_str[3:].rstrip("`\n")
                
            report_json = json.loads(report_str)
            if "overall_score" not in report_json:
                report_json["overall_score"] = calculated_score
            if "health_grade" not in report_json:
                report_json["health_grade"] = calculated_grade
            
            return {
                "eda_stats": eda_stats,
                "ai_report": report_json,
                "summary_metrics": {
                    "total_records": total_rows,
                    "total_fields": num_fields,
                    "healthy_count": healthy_count,
                    "warning_count": warning_count,
                    "critical_count": critical_count,
                    "score": calculated_score,
                    "grade": calculated_grade
                }
            }
        except Exception as e:
            logger.error(f"Failed to generate LLM report: {e}")
            return {
                "eda_stats": eda_stats,
                "ai_report": {
                    "report_title": f"Executive Data Quality Report: {target_object} Master Data",
                    "overall_score": calculated_score,
                    "health_grade": calculated_grade,
                    "executive_summary": f"Exploratory Data Analysis completed across {total_rows} records and {num_fields} fields with an overall completeness score of {calculated_score}%.",
                    "critical_warnings": [f"{critical_count} field(s) have critical null rates (>50% empty)."] if critical_count > 0 else [],
                    "recommendations": ["Review unpopulated mandatory fields before starting harmonization."]
                },
                "summary_metrics": {
                    "total_records": total_rows,
                    "total_fields": num_fields,
                    "healthy_count": healthy_count,
                    "warning_count": warning_count,
                    "critical_count": critical_count,
                    "score": calculated_score,
                    "grade": calculated_grade
                }
            }

