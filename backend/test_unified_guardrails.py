"""
Unit & Integration Test Suite for Unified Dynamic Rules Guardrails Engine
==========================================================================
Verifies that all 4 dynamic rule prompt boxes (Harmonize, Validate, Cleanse, Transform)
strictly enforce the unified guardrail standards:
  1. AST Security Sandbox
  2. Master Data Preservation
  3. Schema & Column Integrity
  4. Dataset Invariance
  5. Safe Execution Environment
"""

import sys
from pathlib import Path
import pandas as pd

# Add backend directory to sys.path
backend_dir = Path(__file__).resolve().parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from services.dynamic_guardrails import (
    UNSAFE_DEFAULT_FIELDS,
    is_master_data_field,
    check_master_data_preservation,
    verify_dataset_invariance,
    verify_required_columns_intact,
    validate_harmonization_transform_ast,
    validate_validation_condition_ast,
    validate_cleansing_fixer_ast,
    validate_transformation_script_ast,
)
from agents.harmonization_agent import HarmonizationAgent, HarmonizationConfig
from agents.validation_agent import ValidationAgent
from agents.cleanser_agent import validate_dynamic_fixer_code
from agents.transformation_agent import TransformationAgent


def test_ast_sandbox_harmonization():
    print("Testing Step 4 (Harmonization) AST Guardrail...")
    # Safe function
    safe_code = "def transform(value, row):\n    return value.strip().upper()\n"
    ok, msg = validate_harmonization_transform_ast(safe_code)
    assert ok, f"Expected safe harmonization code to pass: {msg}"

    # Dangerous: os.system
    bad_code = "def transform(value, row):\n    import os\n    os.system('whoami')\n    return value\n"
    ok, msg = validate_harmonization_transform_ast(bad_code)
    assert not ok, "Expected os import to be blocked"
    assert "forbidden by guardrails" in msg

    # Dangerous: file open
    bad_open = "def transform(value, row):\n    f = open('secret.txt', 'w')\n    return value\n"
    ok, msg = validate_harmonization_transform_ast(bad_open)
    assert not ok, "Expected open() call to be blocked"
    assert "Calling forbidden function 'open'" in msg

    # Wrong signature
    bad_sig = "def transform(val):\n    return val\n"
    ok, msg = validate_harmonization_transform_ast(bad_sig)
    assert not ok, "Expected wrong signature to be blocked"
    print("  [PASS] Step 4 Harmonization AST Guardrail verified.")


def test_ast_sandbox_validation():
    print("Testing Step 5 (Validation) AST Guardrail...")
    # Safe boolean condition
    safe_cond = "str(row.get('LAND1', '')).strip() != 'US'"
    ok, msg = validate_validation_condition_ast(safe_cond)
    assert ok, f"Expected safe validation condition to pass: {msg}"

    # Dangerous: eval
    bad_cond = "eval('__import__(\"os\").system(\"calc\")')"
    ok, msg = validate_validation_condition_ast(bad_cond)
    assert not ok, "Expected eval to be blocked"

    # Dangerous: subprocess
    bad_sub = "subprocess.run(['ls'])"
    ok, msg = validate_validation_condition_ast(bad_sub)
    assert not ok, "Expected subprocess call to be blocked"
    print("  [PASS] Step 5 Validation AST Guardrail verified.")


def test_ast_sandbox_cleansing():
    print("Testing Step 6 (Cleansing) AST Guardrail...")
    # Safe fixer
    safe_fixer = "def fix_dynamic_rule(df, issue_rows):\n    df['NAME1'] = df['NAME1'].str.strip()\n    return df\n"
    ok, msg = validate_cleansing_fixer_ast(safe_fixer)
    assert ok, f"Expected safe cleansing fixer to pass: {msg}"
    # Ensure backward compatibility alias in cleanser_agent works
    ok_alias, _ = validate_dynamic_fixer_code(safe_fixer)
    assert ok_alias, "Expected cleanser_agent.validate_dynamic_fixer_code alias to pass"

    # Dangerous: to_csv export
    bad_fixer = "def fix_dynamic_rule(df, issue_rows):\n    df.to_csv('exfiltrated.csv')\n    return df\n"
    ok, msg = validate_cleansing_fixer_ast(bad_fixer)
    assert not ok, "Expected to_csv method call to be blocked"
    assert "to_csv" in msg
    print("  [PASS] Step 6 Cleansing AST Guardrail verified.")


def test_ast_sandbox_transformation():
    print("Testing Step 7 (Transformation) AST Guardrail...")
    # Safe transform script
    safe_script = "def transform_data(df):\n    df['CITY'] = df['CITY'].str.title()\n    return df\n"
    ok, msg = validate_transformation_script_ast(safe_script)
    assert ok, f"Expected safe transformation script to pass: {msg}"

    # Dangerous: socket connection
    bad_script = "def transform_data(df):\n    import socket\n    s = socket.socket()\n    return df\n"
    ok, msg = validate_transformation_script_ast(bad_script)
    assert not ok, "Expected socket import to be blocked"
    assert "socket" in msg

    # Dangerous: to_sql
    bad_sql = "def transform_data(df):\n    df.to_sql('table', con=None)\n    return df\n"
    ok, msg = validate_transformation_script_ast(bad_sql)
    assert not ok, "Expected to_sql method to be blocked"
    print("  [PASS] Step 7 Transformation AST Guardrail verified.")


def test_master_data_preservation():
    print("Testing Master Data Preservation Guardrail...")
    assert is_master_data_field("KUNNR")
    assert is_master_data_field("LIFNR")
    assert is_master_data_field("BUKRS")
    assert is_master_data_field("VKORG")
    assert is_master_data_field("S_CUST_GEN.KUNNR")
    assert not is_master_data_field("NAME1")
    assert not is_master_data_field("CITY")

    # Blanking out customer ID is blocked
    ok, reason = check_master_data_preservation("KUNNR", "0001002003", "")
    assert not ok, "Blanking out KUNNR must be blocked"
    assert "Master data preservation safeguard" in reason

    # Normal update allowed
    ok, _ = check_master_data_preservation("NAME1", "Acme", "Acme Corp")
    assert ok

    # Legitimate non-blank format update of master key (e.g. zero padding) allowed
    ok, _ = check_master_data_preservation("KUNNR", "1002", "0000001002")
    assert ok
    print("  [PASS] Master Data Preservation Guardrail verified.")


def test_dataset_invariance_and_schema():
    print("Testing Dataset Invariance & Schema Integrity Guardrails...")
    df_before = pd.DataFrame([{"KUNNR": "1", "NAME1": "A"}, {"KUNNR": "2", "NAME1": "B"}])
    
    # 1. Accidental row drop blocked
    df_dropped = pd.DataFrame([{"KUNNR": "1", "NAME1": "A"}])
    ok, reason = verify_dataset_invariance(df_before, df_dropped, allow_drops=False)
    assert not ok
    assert "Unexpected row deletion" in reason

    # 2. Row explosion blocked
    df_exploded = pd.concat([df_before] * 10, ignore_index=True)
    ok, reason = verify_dataset_invariance(df_before, df_exploded, max_explosion_ratio=1.5)
    assert not ok
    assert "Row explosion detected" in reason

    # 3. Column drop blocked
    df_missing_col = pd.DataFrame([{"NAME1": "A"}, {"NAME1": "B"}])
    ok, reason = verify_required_columns_intact(df_before, df_missing_col, required_columns=["KUNNR", "NAME1"])
    assert not ok
    assert "Required SAP column(s) missing" in reason
    print("  [PASS] Dataset Invariance & Schema Integrity Guardrails verified.")


def test_agent_integration_transformation():
    print("Testing TransformationAgent execution with Guardrails...")
    agent = TransformationAgent()
    rows = [{"KUNNR": "0001", "NAME1": "John", "CITY": "Berlin"}]

    # 1. Dangerous script is rejected before execution
    bad_code = "def transform_data(df):\n    import os\n    os.system('echo test')\n    return df\n"
    res_rows, summary = agent.apply_ai_script(rows, bad_code)
    assert summary.get("audit_log", [])[0]["status"] == "REJECTED"
    assert "security violation" in summary.get("audit_log", [])[0]["new_value"]

    # 2. Script attempting to blank out KUNNR triggers master data safeguard
    blanking_code = "def transform_data(df):\n    df['KUNNR'] = ''\n    return df\n"
    res_rows, summary = agent.apply_ai_script(rows, blanking_code)
    # The cell change must be reverted and safeguarded
    assert res_rows[0]["KUNNR"] == "0001"
    assert any(log["rule_code"] == "MASTER_DATA_PRESERVED" for log in summary.get("audit_log", []))

    # 3. Legitimate script runs safely
    good_code = "def transform_data(df):\n    df['CITY'] = df['CITY'].str.upper()\n    return df\n"
    res_rows, summary = agent.apply_ai_script(rows, good_code)
    assert res_rows[0]["CITY"] == "BERLIN"
    assert summary["rows_modified"] == 1
    print("  [PASS] TransformationAgent Guardrails Integration verified.")


def run_all_guardrail_tests():
    print("=" * 65)
    print("RUNNING UNIFIED DYNAMIC RULES GUARDRAILS TEST SUITE")
    print("=" * 65)
    test_ast_sandbox_harmonization()
    test_ast_sandbox_validation()
    test_ast_sandbox_cleansing()
    test_ast_sandbox_transformation()
    test_master_data_preservation()
    test_dataset_invariance_and_schema()
    test_agent_integration_transformation()
    print("=" * 65)
    print("ALL UNIFIED GUARDRAILS TESTS PASSED SUCCESSFULLY (7/7)!")
    print("=" * 65)


if __name__ == "__main__":
    run_all_guardrail_tests()
