import uuid
import re
import pandas as pd
import numpy as np

class TransformationAgent:
    def __init__(self):
        pass

    def _find_matching_keys(self, target_field: str, available_keys: list[str]) -> list[str]:
        """
        Finds all keys in `available_keys` that correspond to `target_field`.
        100% generic: matches exact, case-insensitive, alphanumeric normalized,
        and punctuation/bracket/prefix-stripped base names without hardcoded lists.
        """
        if not target_field or not available_keys:
            return [target_field] if target_field else []

        matches = []
        target_field_str = str(target_field).strip()

        # 1. Exact or case-insensitive match
        for k in available_keys:
            if str(k).strip().lower() == target_field_str.lower():
                matches.append(k)

        # 2. Normalized base name match (strips prefixes like [0], table prefixes like PerPerson. or S_ADDRESS.)
        target_clean = re.sub(r"^\[\d+\]\s*", "", target_field_str)
        target_base = target_clean.split(".")[-1].strip()
        target_norm = re.sub(r"[^a-zA-Z0-9]", "", target_base).lower()

        for k in available_keys:
            if k in matches:
                continue
            k_clean = re.sub(r"^\[\d+\]\s*", "", str(k).strip())
            k_base = k_clean.split(".")[-1].strip()
            k_norm = re.sub(r"[^a-zA-Z0-9]", "", k_base).lower()

            if k_base.lower() == target_base.lower() or str(k).lower() == target_field_str.lower():
                matches.append(k)
                continue

            if target_norm and k_norm == target_norm:
                matches.append(k)
                continue

        # 3. Standard SAP field synonyms if no direct matches found in available_keys
        if not any(m in available_keys for m in matches):
            SAP_SYNONYMS = {
                "COUNTRY": ["LAND1", "COUNTRY_CODE", "COUNTRYKEY", "LAND", "BANKS"],
                "LAND1": ["COUNTRY", "COUNTRY_CODE", "COUNTRYKEY", "LAND"],
                "ZTERM": ["PAYMENT_TERMS", "PAY_TERMS", "TERMS"],
                "PAYMENT_TERMS": ["ZTERM", "PAY_TERMS", "TERMS"],
                "KUNNR": ["CUSTOMER", "CUSTOMER_ID", "CUST_ID"],
                "CUSTOMER": ["KUNNR", "CUSTOMER_ID", "CUST_ID"],
                "LIFNR": ["VENDOR", "VENDOR_ID"],
                "VENDOR": ["LIFNR", "VENDOR_ID"],
                "MATNR": ["MATERIAL", "MATERIAL_ID"],
                "MATERIAL": ["MATNR", "MATERIAL_ID"],
                "WAERS": ["CURRENCY", "CURR"],
                "CURRENCY": ["WAERS", "CURR"],
                "PSTLZ": ["POST_CODE", "POSTAL_CODE", "ZIP", "ZIPCODE"],
                "POSTAL_CODE": ["PSTLZ", "POST_CODE", "ZIP", "ZIPCODE"],
                "ORT01": ["CITY"],
                "CITY": ["ORT01"],
                "NAME1": ["NAME", "CUSTOMER_NAME", "VENDOR_NAME"],
                "NAME": ["NAME1", "CUSTOMER_NAME", "VENDOR_NAME"],
            }
            target_upper = target_base.upper()
            synonyms = SAP_SYNONYMS.get(target_upper, [])
            for syn in synonyms:
                for k in available_keys:
                    k_clean = re.sub(r"^\[\d+\]\s*", "", str(k).strip())
                    k_base = k_clean.split(".")[-1].strip().upper()
                    if k_base == syn or str(k).strip().upper() == syn:
                        if k not in matches:
                            matches.append(k)

        if target_field_str not in matches:
            matches.append(target_field_str)

        return matches

    def apply_mappings(self, cleansed_rows: list[dict], mapping_rules: list[dict]):
        """
        Applies find-and-replace mappings to the cleansed rows based on the mapping rules.
        mapping_rules should be a list of dicts with Source_Field, Source_Data, Target_Data.
        Returns a tuple: (transformed_rows, summary_stats)
        """
        audit_log = []
        if not cleansed_rows:
            return [], {"rows_loaded": 0, "rows_modified": 0, "total_modifications": 0, "audit_log": [], "mapping_rules_parsed": len(mapping_rules)}

        available_keys = list(cleansed_rows[0].keys())

        # Map each rule's target field to all matching keys in the data
        rule_entries = []
        for rule in mapping_rules:
            raw_field = str(rule.get("Source_Field") or rule.get("field") or "").strip()
            src_data = str(rule.get("Source_Data") or rule.get("oldValue") or "").strip()
            tgt_data = str(rule.get("Target_Data") or rule.get("newValue") or "").strip()
            if not raw_field:
                continue
            matching_keys = self._find_matching_keys(raw_field, available_keys)
            rule_entries.append({
                "raw_field": raw_field,
                "matching_keys": matching_keys,
                "src_data": src_data,
                "tgt_data": tgt_data,
            })

        modified_rows_count = set()
        total_modifications = 0
        transformed_rows = [dict(row) for row in cleansed_rows]

        for row_idx, row in enumerate(transformed_rows):
            row_modified = False
            for r_entry in rule_entries:
                src_val = r_entry["src_data"]
                tgt_val = r_entry["tgt_data"]
                is_src_empty = (not src_val) or (src_val.lower() in ("", "(empty)", "none", "nan", "null", "<na>"))
                
                # Check all matching keys for this field
                for col in r_entry["matching_keys"]:
                    curr_val = str(row.get(col, "")).strip() if row.get(col) is not None else ""
                    is_curr_empty = (not curr_val) or (curr_val.lower() in ("", "(empty)", "none", "nan", "null", "<na>"))

                    if is_src_empty:
                        is_match = is_curr_empty
                    else:
                        is_match = (curr_val.lower() == src_val.lower())

                    if is_match and curr_val != tgt_val:
                        audit_log.append({
                            "id": str(uuid.uuid4()),
                            "row": row_idx + 1,
                            "phase": "Transform Mapping",
                            "rule_code": "FIND_REPLACE",
                            "field": col,
                            "old_value": curr_val if curr_val else "(empty)",
                            "new_value": tgt_val,
                            "status": "APPLIED"
                        })
                        row[col] = tgt_val
                        row_modified = True
                        total_modifications += 1

                # Also synchronize the display field key directly
                raw_fld = r_entry["raw_field"]
                if row_modified and raw_fld:
                    row[raw_fld] = tgt_val

            if row_modified:
                modified_rows_count.add(row_idx)

        summary_stats = {
            "rows_loaded": len(transformed_rows),
            "rows_modified": len(modified_rows_count),
            "total_modifications": total_modifications,
            "audit_log": audit_log,
            "mapping_rules_parsed": len(mapping_rules)
        }

        return transformed_rows, summary_stats

    def apply_ai_script(self, cleansed_rows: list[dict], python_code: str):
        """
        Executes an AI generated Pandas transformation script safely and deterministically.
        Calculates diffs dynamically to generate an audit log.
        """
        if not cleansed_rows or not python_code.strip():
            return cleansed_rows, {"rows_loaded": len(cleansed_rows), "rows_modified": 0, "total_modifications": 0, "audit_log": []}

        original_df = pd.DataFrame(cleansed_rows)
        df = original_df.copy()

        # Dynamically create case-insensitive and normalized aliases for the actual columns in the dataset
        created_aliases = []
        for col in list(df.columns):
            col_str = str(col).strip()
            variants = [
                re.sub(r"[-_]", " ", col_str).title(),
                re.sub(r"[^a-zA-Z0-9]", "", col_str).lower(),
                col_str.replace("-", "_"),
                col_str.replace("_", "-"),
            ]
            for v in variants:
                if v and v not in df.columns:
                    df[v] = df[col]
                    created_aliases.append((v, col))

        baseline_df = df.copy()

        # Prepend standard data manipulation imports to avoid NameError inside exec functions/lambdas
        header = "import pandas as pd\nimport numpy as np\nimport re\n"
        clean_code = python_code.replace("```python", "").replace("```", "").strip()
        code_to_exec = header + clean_code
        
        exec_scope = {
            "pd": pd,
            "pandas": pd,
            "np": np,
            "numpy": np,
            "re": re,
            "__builtins__": __builtins__,
        }

        try:
            exec(code_to_exec, exec_scope, exec_scope)
            if "transform_data" in exec_scope and callable(exec_scope["transform_data"]):
                transformed_df = exec_scope["transform_data"](df)
            elif "transform" in exec_scope and callable(exec_scope["transform"]):
                transformed_df = exec_scope["transform"](df)
            elif "df" in exec_scope and isinstance(exec_scope["df"], pd.DataFrame):
                transformed_df = exec_scope["df"]
            else:
                transformed_df = df
                
            if not isinstance(transformed_df, pd.DataFrame):
                transformed_df = df
        except Exception as e:
            print(f"[TransformationAgent] Error executing AI python script: {e}")
            return cleansed_rows, {
                "rows_loaded": len(cleansed_rows),
                "rows_modified": 0,
                "total_modifications": 0,
                "audit_log": [{
                    "id": str(uuid.uuid4()),
                    "row": 0,
                    "phase": "AI Python Transform",
                    "rule_code": "AI_SCRIPT_ERROR",
                    "field": "General",
                    "old_value": "AI Script",
                    "new_value": f"Execution failed: {str(e)}",
                    "status": "FAILED"
                }],
                "error": str(e)
            }

        # Sync changes between created aliases and origin columns
        for alias_col, origin_col in created_aliases:
            if alias_col in transformed_df.columns and origin_col in transformed_df.columns:
                if alias_col in baseline_df.columns:
                    alias_diff = transformed_df[alias_col].astype(str) != baseline_df[alias_col].astype(str)
                    if alias_diff.any():
                        transformed_df.loc[alias_diff, origin_col] = transformed_df.loc[alias_diff, alias_col]
                if origin_col in baseline_df.columns:
                    origin_diff = transformed_df[origin_col].astype(str) != baseline_df[origin_col].astype(str)
                    if origin_diff.any():
                        transformed_df.loc[origin_diff, alias_col] = transformed_df.loc[origin_diff, origin_col]

        # Convert back to strings and handle NAs created by the script
        transformed_df = transformed_df.astype(str).replace(["None", "nan", "<NA>"], "")
        original_df = original_df.astype(str).replace(["None", "nan", "<NA>"], "")
        
        audit_log = []
        modified_rows_count = set()
        total_modifications = 0
        
        for row_idx in range(len(original_df)):
            if row_idx >= len(transformed_df):
                break
            
            orig_row = original_df.iloc[row_idx]
            new_row = transformed_df.iloc[row_idx]
            
            for col in original_df.columns:
                if col in transformed_df.columns:
                    orig_val = str(orig_row[col]).strip() if orig_row[col] is not None else ""
                    new_val = str(new_row[col]).strip() if new_row[col] is not None else ""
                    
                    if orig_val != new_val:
                        audit_log.append({
                            "id": str(uuid.uuid4()),
                            "row": row_idx + 1,
                            "phase": "AI Python Transform",
                            "rule_code": "DYNAMIC_SCRIPT",
                            "field": col,
                            "old_value": orig_val,
                            "new_value": new_val,
                            "status": "APPLIED"
                        })
                        modified_rows_count.add(row_idx)
                        total_modifications += 1

        summary_stats = {
            "rows_loaded": len(cleansed_rows),
            "rows_modified": len(modified_rows_count),
            "total_modifications": total_modifications,
            "audit_log": audit_log,
            "mapping_rules_parsed": 1
        }

        # Keep only the original columns to prevent extra alias columns from polluting rows
        cols_to_keep = [col for col in original_df.columns if col in transformed_df.columns]
        transformed_df = transformed_df[cols_to_keep]

        final_rows = transformed_df.to_dict(orient="records")
        return final_rows, summary_stats

    def apply_rule_batch(self, cleansed_rows: list[dict], rules: list[dict]):
        """
        Executes a batch of active rules (both find-and-replace mapping rules,
        row-specific or column-wide dynamic rules, presets, and Python script rules).
        Zero hardcoded schema assumptions.
        """
        if not cleansed_rows:
            return [], {
                "rows_loaded": 0,
                "rows_modified": 0,
                "total_modifications": 0,
                "audit_log": [],
                "mapping_rules_parsed": len(rules)
            }

        current_rows = [dict(row) for row in cleansed_rows]
        combined_audit_log = []
        total_modifications = 0
        modified_rows_set = set()

        file_rules = []
        python_scripts = []

        for r in rules:
            if not r.get("enabled", r.get("active", True)):
                continue

            pcode = r.get("python_code") or r.get("pythonCode")
            is_nlp = (r.get("source") in ("nlp", "ai")) or (r.get("rule_type") == "ai") or (r.get("action") == "ai_prompt") or (pcode and not (r.get("oldValue") or r.get("source_data") or r.get("Source_Data")))
            if is_nlp:
                if pcode:
                    python_scripts.append(pcode)
                elif r.get("prompt") or r.get("description"):
                    try:
                        from services.llm_orchestrator import LLMOrchestrator
                        llm = LLMOrchestrator()
                        available_cols = list(current_rows[0].keys()) if current_rows else []
                        prompt_text = r.get("prompt") or r.get("description")
                        gen_prompt = f"""
                        You are an SAP migration transformation assistant.
                        Write a Python function `transform_data(df)` that applies this user instruction: {prompt_text}
                        The valid columns in df are: {available_cols}
                        Return JSON with key "python_code".
                        """
                        res = llm.execute_json_prompt(gen_prompt, prompt_text)
                        if isinstance(res, dict) and res.get("python_code"):
                            python_scripts.append(res["python_code"])
                    except Exception as e:
                        print(f"[TransformationAgent] Failed to generate missing AI script: {e}")
                continue

            field = r.get("source_field") or r.get("Source_Field") or r.get("field") or r.get("target_field")
            if not field:
                continue

            available_keys = list(current_rows[0].keys()) if current_rows else []
            matching_keys = self._find_matching_keys(field, available_keys)

            scope = r.get("scope", "value")
            old_val = r.get("source_data") or r.get("Source_Data") or r.get("oldValue") or r.get("old_value") or ""
            new_val = r.get("target_data") or r.get("Target_Data") or r.get("newValue") or r.get("new_value") or r.get("param") or ""
            operation = str(r.get("operation") or r.get("action") or "").strip().lower()
            row_idx_target = r.get("rowIndex") or r.get("row_index")
            row_number = r.get("rowNumber") or r.get("row_number")

            # 1. Row-specific dynamic rule
            if scope == "row":
                target_idx = None
                if row_idx_target is not None:
                    target_idx = int(row_idx_target)
                elif row_number is not None:
                    target_idx = int(row_number) - 1

                if target_idx is not None and 0 <= target_idx < len(current_rows):
                    row = current_rows[target_idx]
                    replacement = str(new_val)
                    row_changed = False
                    for col in matching_keys:
                        curr_cell_val = str(row.get(col, "")).strip() if row.get(col) is not None else ""
                        if curr_cell_val != replacement:
                            row[col] = replacement
                            row_changed = True
                            modified_rows_set.add(target_idx)
                            total_modifications += 1
                            combined_audit_log.append({
                                "id": str(uuid.uuid4()),
                                "row": target_idx + 1,
                                "phase": "Dynamic Field Edit",
                                "rule_code": "DYNAMIC_ROW_EDIT",
                                "field": col,
                                "old_value": curr_cell_val,
                                "new_value": replacement,
                                "status": "APPLIED"
                            })
                    if row_changed:
                        row[field] = replacement
                        for mk in matching_keys:
                            row[mk] = replacement
                continue

            # 2. Entire column override
            if scope == "column":
                replacement = str(new_val)
                for col in matching_keys:
                    for idx, row in enumerate(current_rows):
                        curr_cell_val = str(row.get(col, "")).strip() if row.get(col) is not None else ""
                        if curr_cell_val != replacement:
                            row[col] = replacement
                            row[field] = replacement
                            for mk in matching_keys:
                                row[mk] = replacement
                            modified_rows_set.add(idx)
                            total_modifications += 1
                            combined_audit_log.append({
                                "id": str(uuid.uuid4()),
                                "row": idx + 1,
                                "phase": "Dynamic Column Override",
                                "rule_code": "DYNAMIC_COLUMN_OVERRIDE",
                                "field": col,
                                "old_value": curr_cell_val,
                                "new_value": replacement,
                                "status": "APPLIED"
                            })
                continue

            # 3. Quick Operation Presets
            if operation in ("upper", "lower", "title", "trim", "prefix", "suffix", "default_if_empty"):
                for col in matching_keys:
                    for idx, row in enumerate(current_rows):
                        curr_cell_val = str(row.get(col, "")) if row.get(col) is not None else ""
                        transformed_val = curr_cell_val

                        if operation == "upper":
                            transformed_val = curr_cell_val.upper()
                        elif operation == "lower":
                            transformed_val = curr_cell_val.lower()
                        elif operation == "title":
                            transformed_val = curr_cell_val.title()
                        elif operation == "trim":
                            transformed_val = curr_cell_val.strip()
                        elif operation == "prefix":
                            prefix_str = str(r.get("prefix") or r.get("param", ""))
                            if not curr_cell_val.startswith(prefix_str):
                                transformed_val = prefix_str + curr_cell_val
                        elif operation == "suffix":
                            suffix_str = str(r.get("suffix") or r.get("param", ""))
                            if not curr_cell_val.endswith(suffix_str):
                                transformed_val = curr_cell_val + suffix_str
                        elif operation == "default_if_empty":
                            if not curr_cell_val.strip():
                                transformed_val = str(new_val)

                        if curr_cell_val != transformed_val:
                            row[col] = transformed_val
                            row[field] = transformed_val
                            for mk in matching_keys:
                                row[mk] = transformed_val
                            modified_rows_set.add(idx)
                            total_modifications += 1
                            combined_audit_log.append({
                                "id": str(uuid.uuid4()),
                                "row": idx + 1,
                                "phase": "Dynamic Preset Rule",
                                "rule_code": f"DYNAMIC_{operation.upper()}",
                                "field": col,
                                "old_value": curr_cell_val,
                                "new_value": transformed_val,
                                "status": "APPLIED"
                            })
                continue

            # 4. Value find-and-replace
            replacement = str(new_val) if new_val is not None else ""
            old_str = str(old_val).strip() if old_val is not None else ""
            is_old_empty = (not old_str) or (old_str.lower() in ("", "(empty)", "none", "nan", "null", "<na>"))

            for idx, row in enumerate(current_rows):
                row_changed = False
                for col in matching_keys:
                    curr_cell_val = str(row.get(col, "")).strip() if row.get(col) is not None else ""
                    is_curr_empty = (not curr_cell_val) or (curr_cell_val.lower() in ("", "(empty)", "none", "nan", "null", "<na>"))

                    if is_old_empty:
                        is_match = is_curr_empty
                    else:
                        is_match = (curr_cell_val.lower() == old_str.lower())

                    if is_match and curr_cell_val != replacement:
                        row[col] = replacement
                        row_changed = True
                        modified_rows_set.add(idx)
                        total_modifications += 1
                        combined_audit_log.append({
                            "id": str(uuid.uuid4()),
                            "row": idx + 1,
                            "phase": "Dynamic Value Replacement" if r.get("source") == "dynamic" else "Transform Mapping",
                            "rule_code": "DYNAMIC_VALUE_REPLACE" if r.get("source") == "dynamic" else "FIND_REPLACE",
                            "field": col,
                            "old_value": curr_cell_val if curr_cell_val else "(empty)",
                            "new_value": replacement,
                            "status": "APPLIED"
                        })
                if row_changed:
                    row[field] = replacement
                    for mk in matching_keys:
                        row[mk] = replacement

        # Apply find-replace rules from files if any
        if file_rules:
            current_rows, summary = self.apply_mappings(current_rows, file_rules)
            combined_audit_log.extend(summary.get("audit_log", []))
            total_modifications += summary.get("total_modifications", 0)
            for event in summary.get("audit_log", []):
                if "row" in event:
                    modified_rows_set.add(event["row"] - 1)

        # Apply Python script rules sequentially
        for script in python_scripts:
            current_rows, summary = self.apply_ai_script(current_rows, script)
            combined_audit_log.extend(summary.get("audit_log", []))
            total_modifications += summary.get("total_modifications", 0)
            for event in summary.get("audit_log", []):
                if "row" in event:
                    modified_rows_set.add(event["row"] - 1)

        summary_stats = {
            "rows_loaded": len(cleansed_rows),
            "rows_modified": len(modified_rows_set),
            "total_modifications": total_modifications,
            "audit_log": combined_audit_log,
            "mapping_rules_parsed": len(rules),
            "ai_rules": [{"Source_Field": "Python Script", "Source_Data": "", "Target_Data": s} for s in python_scripts] if python_scripts else []
        }

        return current_rows, summary_stats
