import re
import random
from typing import Dict, List, Any

# SAP schemas
OBJS: Dict[str, List[Dict[str, Any]]] = {
    "CUSTOMER": [
        {"n": "KUNNR", "l": "Customer Number", "t": "CHAR", "len": 10, "req": True},
        {"n": "KTOKD", "l": "Account Group", "t": "CHAR", "len": 4, "req": True},
        {"n": "NAME1", "l": "Name 1", "t": "CHAR", "len": 35, "req": True},
        {"n": "NAME2", "l": "Name 2", "t": "CHAR", "len": 35, "req": False},
        {"n": "LAND1", "l": "Country Key", "t": "CHAR", "len": 3, "req": True},
        {"n": "ORT01", "l": "City", "t": "CHAR", "len": 35, "req": False},
        {"n": "PSTLZ", "l": "Postal Code", "t": "CHAR", "len": 10, "req": False},
        {"n": "REGIO", "l": "Region", "t": "CHAR", "len": 3, "req": False},
        {"n": "STRAS", "l": "Street", "t": "CHAR", "len": 35, "req": False},
        {"n": "TELF1", "l": "Telephone", "t": "CHAR", "len": 16, "req": False},
        {"n": "SMTP_ADDR", "l": "Email", "t": "CHAR", "len": 241, "req": False},
        {"n": "BUKRS", "l": "Company Code", "t": "CHAR", "len": 4, "req": True},
        {"n": "VKORG", "l": "Sales Org", "t": "CHAR", "len": 4, "req": True},
        {"n": "VTWEG", "l": "Dist. Channel", "t": "CHAR", "len": 2, "req": True},
        {"n": "SPART", "l": "Division", "t": "CHAR", "len": 2, "req": True},
        {"n": "WAERS", "l": "Currency", "t": "CUKY", "len": 5, "req": False},
        {"n": "ZTERM", "l": "Payment Terms", "t": "CHAR", "len": 4, "req": False},
        {"n": "STCD1", "l": "Tax Number 1", "t": "CHAR", "len": 16, "req": False},
        {"n": "TAXKD", "l": "Tax Class.", "t": "CHAR", "len": 1, "req": False},
        {"n": "ERDAT", "l": "Created On", "t": "DATS", "len": 8, "req": False},
    ],
    "VENDOR": [
        {"n": "LIFNR", "l": "Vendor Number", "t": "CHAR", "len": 10, "req": True},
        {"n": "KTOKK", "l": "Account Group", "t": "CHAR", "len": 4, "req": True},
        {"n": "NAME1", "l": "Vendor Name", "t": "CHAR", "len": 35, "req": True},
        {"n": "LAND1", "l": "Country", "t": "CHAR", "len": 3, "req": True},
        {"n": "ORT01", "l": "City", "t": "CHAR", "len": 35, "req": False},
        {"n": "PSTLZ", "l": "Postal Code", "t": "CHAR", "len": 10, "req": False},
        {"n": "REGIO", "l": "Region", "t": "CHAR", "len": 3, "req": False},
        {"n": "STRAS", "l": "Street", "t": "CHAR", "len": 35, "req": False},
        {"n": "TELF1", "l": "Telephone", "t": "CHAR", "len": 16, "req": False},
        {"n": "SMTP_ADDR", "l": "Email", "t": "CHAR", "len": 241, "req": False},
        {"n": "BUKRS", "l": "Company Code", "t": "CHAR", "len": 4, "req": True},
        {"n": "EKORG", "l": "Purchasing Org", "t": "CHAR", "len": 4, "req": True},
        {"n": "WAERS", "l": "Currency", "t": "CUKY", "len": 5, "req": False},
        {"n": "ZTERM", "l": "Payment Terms", "t": "CHAR", "len": 4, "req": False},
        {"n": "STCD1", "l": "Tax Number", "t": "CHAR", "len": 16, "req": False},
        {"n": "BANKS", "l": "Bank Country", "t": "CHAR", "len": 3, "req": False},
        {"n": "BANKN", "l": "Bank Account", "t": "CHAR", "len": 18, "req": False},
        {"n": "ERDAT", "l": "Created On", "t": "DATS", "len": 8, "req": False},
    ],
    "MATERIAL": [
        {"n": "MATNR", "l": "Material Number", "t": "CHAR", "len": 40, "req": True},
        {"n": "MBRSH", "l": "Industry Sector", "t": "CHAR", "len": 1, "req": True},
        {"n": "MTART", "l": "Material Type", "t": "CHAR", "len": 4, "req": True},
        {"n": "MAKTX", "l": "Description", "t": "CHAR", "len": 40, "req": True},
        {"n": "MEINS", "l": "Base UoM", "t": "UNIT", "len": 3, "req": True},
        {"n": "MATKL", "l": "Material Group", "t": "CHAR", "len": 9, "req": False},
        {"n": "WERKS", "l": "Plant", "t": "CHAR", "len": 4, "req": True},
        {"n": "LGORT", "l": "Storage Loc.", "t": "CHAR", "len": 4, "req": False},
        {"n": "BRGEW", "l": "Gross Weight", "t": "DEC", "len": 15, "req": False},
        {"n": "NTGEW", "l": "Net Weight", "t": "DEC", "len": 15, "req": False},
        {"n": "GEWEI", "l": "Weight Unit", "t": "UNIT", "len": 3, "req": False},
        {"n": "EKGRP", "l": "Purchasing Grp", "t": "CHAR", "len": 3, "req": False},
        {"n": "BKLAS", "l": "Valuation Class", "t": "CHAR", "len": 4, "req": False},
    ],
}

RULES = [
    {"id": "REQUIRED_FIELDS", "label": "Required Fields", "description": "Must not be empty"},
    {"id": "FIELD_LENGTH", "label": "Field Length", "description": "Max char enforcement"},
    {"id": "COUNTRY_ISO", "label": "Country ISO", "description": "2-3 letter format"},
    {"id": "CURRENCY_ISO", "label": "Currency ISO", "description": "3-letter ISO 4217"},
    {"id": "NUMERIC_ID", "label": "Numeric IDs", "description": "KUNNR/LIFNR digits"},
    {"id": "EMAIL_FORMAT", "label": "Email Format", "description": "Valid @ format"},
    {"id": "DATE_FORMAT", "label": "Date Format", "description": "YYYYMMDD 8 digits"},
    {"id": "PAYMENT_TERMS", "label": "Payment Terms", "description": "SAP NT30/NT45 format"},
]

EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
COUNTRY_RE = re.compile(r"^[A-Z]{2,3}$")
CURRENCY_RE = re.compile(r"^[A-Z]{3}$")
NUMERIC_ID_RE = re.compile(r"^\d{1,10}$")
DATE_RE = re.compile(r"^\d{8}$")
PAYMENT_TERM_RE = re.compile(r"^[A-Z]{2}\d{2}$")


class ValidationAgent:
    def __init__(self):
        pass

    def validate_row(self, row: Dict[str, Any], fields: List[Dict[str, Any]]) -> Dict[str, Any]:
        errs: List[Dict[str, str]] = []
        warns: List[Dict[str, str]] = []

        for f in fields:
            if f["n"] not in row:
                continue
                
            raw = row.get(f["n"])
            sv = str(raw).strip() if raw is not None else ""

            if f["req"] and not sv:
                errs.append({"f": f["n"], "m": "Required field empty", "sev": "ERROR", "rule": "REQUIRED_FIELDS"})
                continue
            if not sv:
                continue

            if f["len"] and len(sv) > f["len"]:
                errs.append({"f": f["n"], "m": f"Exceeds max length {f['len']} (actual {len(sv)})", "sev": "ERROR", "rule": "FIELD_LENGTH"})

            if f["n"] == "LAND1" and not COUNTRY_RE.match(sv):
                errs.append({"f": f["n"], "m": "Country must be ISO 2-3 chars", "sev": "ERROR", "rule": "COUNTRY_ISO"})

            if f["t"] == "CUKY" and not CURRENCY_RE.match(sv):
                warns.append({"f": f["n"], "m": "Must be 3-letter ISO currency", "sev": "WARN", "rule": "CURRENCY_ISO"})

            if f["n"] in ("KUNNR", "LIFNR") and not NUMERIC_ID_RE.match(sv):
                errs.append({"f": f["n"], "m": "Must be numeric ≤10 digits", "sev": "ERROR", "rule": "NUMERIC_ID"})

            if f["n"] == "SMTP_ADDR" and not EMAIL_RE.match(sv):
                warns.append({"f": f["n"], "m": "Invalid email format", "sev": "WARN", "rule": "EMAIL_FORMAT"})

            if f["t"] == "DATS" and not DATE_RE.match(sv):
                warns.append({"f": f["n"], "m": "Must be YYYYMMDD", "sev": "WARN", "rule": "DATE_FORMAT"})

            if f["n"] == "ZTERM" and not PAYMENT_TERM_RE.match(sv):
                warns.append({"f": f["n"], "m": "Must match SAP terms format e.g. NT30", "sev": "WARN", "rule": "PAYMENT_TERMS"})

        st = "ERROR" if errs else ("WARN" if warns else "PASS")
        return {"errs": errs, "warns": warns, "st": st}

    def run_validation(self, obj: str, rows: List[Dict[str, Any]]) -> Dict[str, Any]:
        fields = OBJS.get(obj)
        if not fields:
            raise ValueError(f"Unknown SAP object '{obj}'. Expected one of {list(OBJS.keys())}")

        validated = []
        rule_failures: Dict[str, List[Dict[str, Any]]] = {r["id"]: [] for r in RULES}

        for idx, row in enumerate(rows):
            result = self.validate_row(row, fields)
            validated.append({"idx": idx, "row": row, "errs": result["errs"], "warns": result["warns"], "st": result["st"]})
            for issue in result["errs"] + result["warns"]:
                rule_failures[issue["rule"]].append({
                    "idx": idx,
                    "field": issue["f"],
                    "value": row.get(issue["f"], ""),
                    "message": issue["m"],
                    "severity": issue["sev"],
                })

        total = len(rows)
        report = []
        for r in RULES:
            fails = rule_failures[r["id"]]
            fail_row_count = len({f["idx"] for f in fails})
            report.append({
                "rule": r["id"],
                "label": r["label"],
                "description": r["description"],
                "totalChecked": total,
                "failCount": fail_row_count,
                "passCount": total - fail_row_count,
                "failures": fails,
            })

        stats = {
            "total": total,
            "errors": sum(1 for v in validated if v["st"] == "ERROR"),
            "warns": sum(1 for v in validated if v["st"] == "WARN"),
            "passed": sum(1 for v in validated if v["st"] == "PASS"),
        }

        return {"validated": validated, "report": report, "stats": stats}

# Generator for Sample CSV
_VALID_COUNTRIES = ["IN", "US", "DE", "GB", "FR", "SG", "AU", "CA", "JP", "AE"]
_VALID_CURRENCIES = ["INR", "USD", "EUR", "GBP", "SGD", "AUD", "CAD", "JPY", "AED"]
_VALID_ZTERMS = ["NT30", "NT45", "NT60", "NT90"]
_ACCOUNT_GROUPS = ["KUNA", "EXPU"]
_CITIES = ["Bengaluru", "Chicago", "Berlin", "London", "Paris", "Singapore", "Sydney", "Toronto", "Tokyo", "Dubai"]
_COMPANY_PREFIXES = ["Acme", "Global", "Summit", "Pioneer", "Nova", "Orion", "Vertex", "Alpine", "Cobalt", "Meridian"]
_COMPANY_SUFFIXES = ["Trading Co", "Industries", "Enterprises", "Logistics", "Holdings", "Manufacturing", "Solutions", "Traders", "Group", "Corp"]

def gen_customer_rows(count: int) -> List[Dict[str, str]]:
    random.seed(42)  # deterministic sample, reproducible downloads
    rows: List[Dict[str, str]] = []

    for i in range(count):
        country = random.choice(_VALID_COUNTRIES)
        row = {
            "KUNNR": str(1000000000 + i).zfill(10),
            "KTOKD": random.choice(_ACCOUNT_GROUPS),
            "NAME1": f"{random.choice(_COMPANY_PREFIXES)} {random.choice(_COMPANY_SUFFIXES)} {i}",
            "NAME2": "",
            "LAND1": country,
            "ORT01": random.choice(_CITIES),
            "PSTLZ": str(random.randint(10000, 99999)),
            "REGIO": "",
            "STRAS": f"{random.randint(1, 999)} Main Street",
            "TELF1": f"+1-555-{random.randint(1000, 9999)}",
            "SMTP_ADDR": f"contact{i}@example.com",
            "BUKRS": "1000",
            "VKORG": "1000",
            "VTWEG": "10",
            "SPART": "00",
            "WAERS": random.choice(_VALID_CURRENCIES),
            "ZTERM": random.choice(_VALID_ZTERMS),
            "STCD1": f"TAX{random.randint(100000, 999999)}",
            "TAXKD": random.choice(["0", "1"]),
            "ERDAT": "20240115",
        }

        # Deterministically seed violations
        if i % 13 == 0:
            row[random.choice(["NAME1", "LAND1", "BUKRS"])] = ""
        if i % 17 == 3:
            row["NAME1"] = row["NAME1"] + " " + "Extended Legal Entity Name Overflow Text"
        if i % 11 == 5:
            row["LAND1"] = random.choice(["USA1", "de", "XXXX", "1"])
        if i % 9 == 2:
            row["WAERS"] = random.choice(["Rupees", "inr", "12", "DOLLAR"])
        if i % 14 == 7:
            row["KUNNR"] = random.choice(["ABCDEFGHIJ", "12345678901", "12AB56"])
        if i % 10 == 4:
            row["SMTP_ADDR"] = random.choice(["invalid-email", "user@@example.com", "user@nodomain", "plaintext"])
        if i % 12 == 6:
            row["ERDAT"] = random.choice(["2024-01-15", "15012024", "2024131", "01/15/2024"])
        if i % 15 == 8:
            row["ZTERM"] = random.choice(["NET30", "30", "Immediate", "N30"])

        rows.append(row)

    return rows
