"""
Harmonization Agent — Parameterized Data Harmonization Engine
=============================================================

A standalone Python agent that harmonizes data from one or more sources
into a unified, SAP S/4HANA-ready table.

Two modes:
  - Multi-Source: Primary + Secondary data with separate mappings per source.
                  Row-append merge with null-filling for missing columns.
  - Single-Source: One table, apply 11 harmonization rules directly.

11 Core Harmonization Rules:
  1. Key-based Dedup
  2. Empty Row Filter
  3. Country → ISO
  4. Currency → ISO
  5. PayTerms → SAP
  6. MatType → SAP
  7. Whitespace Trim
  8. Date → YYYYMMDD
  9. Phone/Fax Cleanup
  10. UOM → SAP
  11. Text Truncate 35

Usage (CLI):
  python harmonization_agent.py --mode single --primary data.csv --object CUSTOMER --output result.csv
  python harmonization_agent.py --mode multi --primary p.csv --secondary s.csv \\
      --primary-mapping pm.csv --secondary-mapping sm.csv --object VENDOR --output result.csv
"""

import argparse
import csv
import io
import re
import sys
from dataclasses import dataclass, field
from typing import Any, Callable, Dict, List, Optional, Tuple

import pandas as pd


# ══════════════════════════════════════════════════════════
# 1. LOOKUP MAPS (ported from src/data/lookup-maps.ts)
# ══════════════════════════════════════════════════════════

COUNTRY_MAP: Dict[str, str] = {
    "AFGHANISTAN": "AF", "ALBANIA": "AL", "ALGERIA": "DZ", "AMERICAN SAMOA": "AS", "ANDORRA": "AD", "ANGOLA": "AO", "ANGUILLA": "AI",
    "ANTARCTICA": "AQ", "ANTARCTICA (THE TERRITORY SOUTH OF 60 DEG S)": "AQ", "ANTIGUA AND BARBUDA": "AG", "ARGENTINA": "AR", "ARMENIA": "AM",
    "ARUBA": "AW", "AUSTRALIA": "AU", "AUSTRIA": "AT", "AZERBAIJAN": "AZ", "BAHAMAS": "BS", "BAHRAIN": "BH", "BANGLADESH": "BD",
    "BARBADOS": "BB", "BELARUS": "BY", "BELGIUM": "BE", "BELIZE": "BZ", "BENIN": "BJ", "BERMUDA": "BM", "BHUTAN": "BT",
    "BILLING_COUNTRY": "IN", "BOLIVIA": "BO", "BOSNIA AND HERZEGOVINA": "BA", "BOTSWANA": "BW", "BOUVET ISLAND (BOUVETOYA)": "BV",
    "BRAZIL": "BR", "BRITISH VIRGIN ISLANDS": "VG", "BRUNEI DARUSSALAM": "BN", "BULGARIA": "BG", "BURKINA FASO": "BF", "BURUNDI": "BI",
    "CAMBODIA": "KH", "CAMEROON": "CM", "CANADA": "CA", "CAPE VERDE": "CV", "CAYMAN ISLANDS": "KY", "CENTRAL AFRICAN REPUBLIC": "CF",
    "CHAD": "TD", "CHILE": "CL", "CHINA": "CN", "COCOS (KEELING) ISLANDS": "CC", "COLOMBIA": "CO", "COMOROS": "KM", "CONGO": "CG",
    "COOK ISLANDS": "CK", "COSTA RICA": "CR", "CROATIA": "HR", "CUBA": "CU", "CYPRUS": "CY", "CZECH REPUBLIC": "CZ", "DENMARK": "DK",
    "DJIBOUTI": "DJ", "DOMINICA": "DM", "DOMINICAN REPUBLIC": "DO", "ECUADOR": "EC", "EGYPT": "EG", "EL SALVADOR": "SV",
    "EQUATORIAL GUINEA": "GQ", "ERITREA": "ER", "ESTONIA": "EE", "ETHIOPIA": "ET", "FALKLAND ISLANDS (MALVINAS)": "FK", "FAROE ISLANDS": "FO",
    "FIJI": "FJ", "FINLAND": "FI", "FRANCE": "FR", "FRENCH GUIANA": "GF", "FRENCH POLYNESIA": "PF", "FRENCH SOUTHERN TERRITORIES": "TF",
    "GABON": "GA", "GAMBIA": "GM", "GEORGIA": "GE", "GERMANY": "DE", "GHANA": "GH", "GIBRALTAR": "GI", "GREECE": "GR", "GREENLAND": "GL",
    "GRENADA": "GD", "GUADELOUPE": "GP", "GUAM": "GU", "GUATEMALA": "GT", "GUERNSEY": "GG", "GUINEA": "GN", "GUINEA-BISSAU": "GW",
    "GUYANA": "GY", "HAITI": "HT", "HEARD ISLAND AND MCDONALD ISLANDS": "HM", "HOLY SEE (VATICAN CITY STATE)": "VA", "HONDURAS": "HN",
    "HONG KONG": "HK", "HUNGARY": "HU", "ICELAND": "IS", "INDIA": "IN", "INDONESIA": "ID", "IRAN": "IR", "IRAQ": "IQ", "IRELAND": "IE",
    "ISLE OF MAN": "IM", "ISRAEL": "IL", "ITALY": "IT", "JAMAICA": "JM", "JAPAN": "JP", "JERSEY": "JE", "JORDAN": "JO", "KAZAKHSTAN": "KZ",
    "KENYA": "KE", "KIRIBATI": "KI", "KOREA": "KR", "SOUTH KOREA": "KR", "NORTH KOREA": "KP", "KUWAIT": "KW", "KYRGYZ REPUBLIC": "KG",
    "LAO PEOPLE'S DEMOCRATIC REPUBLIC": "LA", "LATVIA": "LV", "LEBANON": "LB", "LESOTHO": "LS", "LIBERIA": "LR", "LIBYA": "LY",
    "LIECHTENSTEIN": "LI", "LITHUANIA": "LT", "LUXEMBOURG": "LU", "MACAO": "MO", "MACAU": "MO", "MADAGASCAR": "MG", "MALAWI": "MW",
    "MALAYSIA": "MY", "MALDIVES": "MV", "MALI": "ML", "MALTA": "MT", "MARSHALL ISLANDS": "MH", "MARTINIQUE": "MQ", "MAURITANIA": "MR",
    "MAURITIUS": "MU", "MEXICO": "MX", "MICRONESIA": "FM", "MOLDOVA": "MD", "MONACO": "MC", "MONGOLIA": "MN", "MONTSERRAT": "MS",
    "MOROCCO": "MA", "MOZAMBIQUE": "MZ", "MYANMAR": "MM", "NAMIBIA": "NA", "NAURU": "NR", "NEPAL": "NP", "NETHERLANDS": "NL",
    "NETHERLANDS ANTILLES": "AN", "NEW CALEDONIA": "NC", "NEW ZEALAND": "NZ", "NICARAGUA": "NI", "NIGER": "NE", "NIGERIA": "NG",
    "NIUE": "NU", "NORFOLK ISLAND": "NF", "NORWAY": "NO", "OMAN": "OM", "PAKISTAN": "PK", "PALAU": "PW", "PALESTINIAN TERRITORY": "PS",
    "PANAMA": "PA", "PAPUA NEW GUINEA": "PG", "PARAGUAY": "PY", "PERU": "PE", "PHILIPPINES": "PH", "POLAND": "PL", "PORTUGAL": "PT",
    "PUERTO RICO": "PR", "QATAR": "QA", "ROMANIA": "RO", "RUSSIA": "RU", "RUSSIAN FEDERATION": "RU", "RWANDA": "RW", "SAINT BARTHELEMY": "BL",
    "SAINT HELENA": "SH", "SAINT KITTS AND NEVIS": "KN", "SAINT LUCIA": "LC", "SAINT MARTIN": "MF", "SAINT PIERRE AND MIQUELON": "PM",
    "SAINT VINCENT AND THE GRENADINES": "VC", "SAMOA": "WS", "SAN MARINO": "SM", "SAO TOME AND PRINCIPE": "ST", "SAUDI ARABIA": "SA",
    "SENEGAL": "SN", "SERBIA": "RS", "SEYCHELLES": "SC", "SIERRA LEONE": "SL", "SINGAPORE": "SG", "SLOVAKIA (SLOVAK REPUBLIC)": "SK",
    "SLOVENIA": "SI", "SOLOMON ISLANDS": "SB", "SOMALIA": "SO", "SOUTH AFRICA": "ZA", "SOUTH GEORGIA AND THE SOUTH SANDWICH ISLANDS": "GS",
    "SPAIN": "ES", "SRI LANKA": "LK", "SUDAN": "SD", "SURINAME": "SR", "SVALBARD & JAN MAYEN ISLANDS": "SJ", "SWAZILAND": "SZ",
    "ESWATINI": "SZ", "SWEDEN": "SE", "SWITZERLAND": "CH", "SYRIAN ARAB REPUBLIC": "SY", "TAIWAN": "TW", "TAJIKISTAN": "TJ",
    "TANZANIA": "TZ", "THAILAND": "TH", "TIMOR-LESTE": "TL", "TOGO": "TG", "TOKELAU": "TK", "TONGA": "TO", "TRINIDAD AND TOBAGO": "TT",
    "TUNISIA": "TN", "TURKEY": "TR", "TURKMENISTAN": "TM", "TURKS AND CAICOS ISLANDS": "TC", "TUVALU": "TV", "UAE": "AE", "UGANDA": "UG",
    "UK": "GB", "UKRAINE": "UA", "UNITED ARAB EMIRATES": "AE", "UNITED KINGDOM": "GB", "UNITED STATES": "US",
    "UNITED STATES MINOR OUTLYING ISLANDS": "UM", "UNITED STATES OF AMERICA": "US", "UNITED STATES VIRGIN ISLANDS": "VI", "URUGUAY": "UY",
    "USA": "US", "UZBEKISTAN": "UZ", "VANUATU": "VU", "VENEZUELA": "VE", "VIETNAM": "VN", "VIRGIN ISLANDS (BRITISH)": "VG",
    "VIRGIN ISLANDS (U.S.)": "VI", "WESTERN SAHARA": "EH", "YEMEN": "YE", "ZAMBIA": "ZM", "ZIMBABWE": "ZW",
}

COUNTRY_MAP_3: Dict[str, str] = {
    "AFGHANISTAN": "AFG", "ALBANIA": "ALB", "ALGERIA": "DZA", "AMERICAN SAMOA": "ASM", "ANDORRA": "AND", "ANGOLA": "AGO",
    "ARGENTINA": "ARG", "ARMENIA": "ARM", "ARUBA": "ABW", "AUSTRALIA": "AUS", "AUSTRIA": "AUT", "AZERBAIJAN": "AZE",
    "BAHAMAS": "BHS", "BAHRAIN": "BHR", "BANGLADESH": "BGD", "BARBADOS": "BRB", "BELARUS": "BLR", "BELGIUM": "BEL",
    "BERMUDA": "BMU", "BHUTAN": "BTN", "BOLIVIA": "BOL", "BRAZIL": "BRA", "BULGARIA": "BGR", "CAMBODIA": "KHM",
    "CANADA": "CAN", "CHILE": "CHL", "CHINA": "CHN", "COLOMBIA": "COL", "COSTA RICA": "CRI", "CROATIA": "HRV",
    "CUBA": "CUB", "CYPRUS": "CYP", "CZECH REPUBLIC": "CZE", "DENMARK": "DNK", "EGYPT": "EGY", "ESTONIA": "EST",
    "FINLAND": "FIN", "FRANCE": "FRA", "GERMANY": "DEU", "GHANA": "GHA", "GREECE": "GRC", "HONG KONG": "HKG",
    "HUNGARY": "HUN", "ICELAND": "ISL", "INDIA": "IND", "INDONESIA": "IDN", "IRAN": "IRN", "IRAQ": "IRQ",
    "IRELAND": "IRL", "ISRAEL": "ISR", "ITALY": "ITA", "JAMAICA": "JAM", "JAPAN": "JPN", "JORDAN": "JOR",
    "KAZAKHSTAN": "KAZ", "KENYA": "KEN", "KOREA": "KOR", "SOUTH KOREA": "KOR", "KUWAIT": "KWT", "LATVIA": "LVA",
    "LEBANON": "LBN", "LIBYA": "LBY", "LITHUANIA": "LTU", "LUXEMBOURG": "LUX", "MALAYSIA": "MYS", "MALDIVES": "MDV",
    "MALTA": "MLT", "MEXICO": "MEX", "MONACO": "MCO", "MONGOLIA": "MNG", "MOROCCO": "MAR", "NEPAL": "NPL",
    "NETHERLANDS": "NLD", "NEW ZEALAND": "NZL", "NIGERIA": "NGA", "NORWAY": "NOR", "OMAN": "OMN", "PAKISTAN": "PAK",
    "PANAMA": "PAN", "PARAGUAY": "PRY", "PERU": "PER", "PHILIPPINES": "PHL", "POLAND": "POL", "PORTUGAL": "PRT",
    "QATAR": "QAT", "ROMANIA": "ROU", "RUSSIA": "RUS", "RUSSIAN FEDERATION": "RUS", "SAUDI ARABIA": "SAU",
    "SINGAPORE": "SGP", "SLOVAKIA": "SVK", "SLOVENIA": "SVN", "SOUTH AFRICA": "ZAF", "SPAIN": "ESP", "SRI LANKA": "LKA",
    "SUDAN": "SDN", "SWEDEN": "SWE", "SWITZERLAND": "CHE", "TAIWAN": "TWN", "THAILAND": "THA", "TUNISIA": "TUN",
    "TURKEY": "TUR", "UAE": "ARE", "UNITED ARAB EMIRATES": "ARE", "UNITED KINGDOM": "GBR", "UK": "GBR",
    "UNITED STATES": "USA", "UNITED STATES OF AMERICA": "USA", "USA": "USA", "URUGUAY": "URY", "VENEZUELA": "VEN",
    "VIETNAM": "VNM", "ZIMBABWE": "ZWE",
    "IN": "IND", "US": "USA", "DE": "DEU", "FR": "FRA", "GB": "GBR", "CA": "CAN", "AU": "AUS", "JP": "JPN", "CN": "CHN", "IT": "ITA", "BR": "BRA", "RU": "RUS", "MX": "MEX", "ES": "ESP", "NL": "NLD", "CH": "CHE", "SE": "SWE", "SG": "SGP"
}

QUANTITY_MAP: Dict[str, str] = {
    "KILOGRAM": "KG", "KILOGRAMS": "KG", "KG": "KG", "KGS": "KG",
    "GRAM": "G", "GRAMS": "G", "G": "G", "GR": "G",
    "MILLIGRAM": "MG", "MILLIGRAMS": "MG", "MG": "MG",
    "TON": "TO", "TONS": "TO", "TONNE": "TO", "TONNES": "TO", "MT": "TO", "METRIC TON": "TO",
    "LITER": "L", "LITERS": "L", "LITRE": "L", "LITRES": "L", "L": "L", "LTR": "L", "LTRS": "L",
    "MILLILITER": "ML", "MILLILITERS": "ML", "MILLILITRE": "ML", "ML": "ML",
    "METER": "M", "METERS": "M", "METRE": "M", "METRES": "M", "M": "M", "MTR": "M",
    "CENTIMETER": "CM", "CENTIMETERS": "CM", "CM": "CM",
    "MILLIMETER": "MM", "MILLIMETERS": "MM", "MM": "MM",
    "KILOMETER": "KM", "KILOMETERS": "KM", "KM": "KM",
    "INCH": "IN", "INCHES": "IN", "IN": "IN",
    "FOOT": "FT", "FEET": "FT", "FT": "FT",
    "YARD": "YD", "YARDS": "YD", "YD": "YD",
    "PIECE": "PC", "PIECES": "PC", "PCS": "PC", "PC": "PC", "P": "PC",
    "EACH": "EA", "EA": "EA",
    "UNIT": "UN", "UNITS": "UN", "UN": "UN",
    "BOX": "BX", "BOXES": "BX", "BX": "BX",
    "CARTON": "CT", "CARTONS": "CT", "CTN": "CT", "CT": "CT",
    "PACK": "PK", "PACKS": "PK", "PKG": "PK", "PACKET": "PK", "PK": "PK",
    "SET": "SET", "SETS": "SET",
    "PAIR": "PR", "PAIRS": "PR", "PR": "PR",
    "DOZEN": "DZ", "DOZ": "DZ", "DZ": "DZ",
    "PALLET": "PAL", "PALLETS": "PAL", "PAL": "PAL",
    "ROLL": "ROL", "ROLLS": "ROL", "RL": "ROL",
    "CONTAINER": "CN", "CONTAINERS": "CN", "CN": "CN",
    "BAG": "BAG", "BAGS": "BAG", "BG": "BAG",
    "BOTTLE": "BTL", "BOTTLES": "BTL", "BTL": "BTL",
    "BARREL": "BBL", "BARRELS": "BBL", "BBL": "BBL", "BBLS": "BBL",
    "GALLON": "GAL", "GALLONS": "GAL", "GAL": "GAL",
    "SQUARE METER": "M2", "SQUARE METERS": "M2", "SQM": "M2", "M2": "M2", "SQ M": "M2",
    "SQUARE FOOT": "FT2", "SQUARE FEET": "FT2", "SQFT": "FT2", "FT2": "FT2", "SQ FT": "FT2",
    "CUBIC METER": "M3", "CUBIC METERS": "M3", "CBM": "M3", "M3": "M3", "CU M": "M3",
    "CUBIC FOOT": "FT3", "CUBIC FEET": "FT3", "CBFT": "FT3", "FT3": "FT3", "CU FT": "FT3",
    "HOUR": "H", "HOURS": "H", "HR": "H", "HRS": "H",
    "DAY": "DAY", "DAYS": "DAY",
    "MONTH": "MON", "MONTHS": "MON",
    "YEAR": "ANN", "YEARS": "ANN",
}

CURRENCY_MAP: Dict[str, str] = {
    "INDIAN RUPEE": "INR",
    "RUPEE": "INR",
    "RUPEES": "INR",
    "RS": "INR",
    "US DOLLAR": "USD",
    "DOLLAR": "USD",
    "EUROS": "EUR",
    "EURO": "EUR",
    "POUND": "GBP",
    "STERLING": "GBP",
    "YEN": "JPY",
    "YUAN": "CNY",
    "RMB": "CNY",
    "DIRHAM": "AED",
    "RIYAL": "SAR",
    "FRANC": "CHF",
    "AUS DOLLAR": "AUD",
    "CANADIAN DOLLAR": "CAD",
}

PAYMENT_TERMS_MAP: Dict[str, str] = {
    "NET30": "NT30",
    "NET 30": "NT30",
    "30 DAYS": "NT30",
    "30DAYS": "NT30",
    "NET45": "NT45",
    "NET 45": "NT45",
    "45 DAYS": "NT45",
    "NET60": "NT60",
    "NET 60": "NT60",
    "60 DAYS": "NT60",
    "NET15": "NT15",
    "NET7": "NT07",
    "IMMEDIATE": "NT00",
    "CASH": "NT00",
    "COD": "NT00",
    "DUE ON RECEIPT": "NT00",
    "2/10 NET30": "2001",
}

MATERIAL_TYPE_MAP: Dict[str, str] = {
    "RAW MATERIAL": "ROH",
    "RAW": "ROH",
    "RM": "ROH",
    "SEMI-FINISHED": "HALB",
    "SEMI FINISHED": "HALB",
    "WIP": "HALB",
    "FINISHED GOODS": "FERT",
    "FINISHED": "FERT",
    "FG": "FERT",
    "TRADING GOODS": "HAWA",
    "TRADING": "HAWA",
    "SERVICE": "DIEN",
    "OPERATING SUPPLIES": "HIBE",
    "CONSUMABLE": "HIBE",
    "HIBE": "HIBE",
}


# ══════════════════════════════════════════════════════════
# 2. SAP SCHEMA DEFINITIONS (ported from src/data/sap-schemas.ts)
# ══════════════════════════════════════════════════════════

# Each field: (name, label, type, max_length, required, is_key, section, description)
SAP_SCHEMAS: Dict[str, Dict[str, Any]] = {
    "CUSTOMER": {
        "label": "Customer Master (XD01)",
        "key_field": "KUNNR",
        "country_fields": ["LAND1"],
        "currency_fields": ["WAERS"],
        "payterm_fields": ["ZTERM"],
    },
    "VENDOR": {
        "label": "Vendor Master (XK01)",
        "key_field": "LIFNR",
        "country_fields": ["LAND1"],
        "currency_fields": ["WAERS"],
        "payterm_fields": ["ZTERM"],
    },
    "MATERIAL": {
        "label": "Material Master (MM01)",
        "key_field": "MATNR",
        "mattype_fields": ["MTART"],
        "uom_fields": ["MEINS"],
        "currency_fields": ["WAERS"],
    },
}


# ══════════════════════════════════════════════════════════
# 3. TRANSFORM FUNCTIONS (ported from lookup-maps.ts TRANSFORMS)
# ══════════════════════════════════════════════════════════

def _tf_none(v: Any) -> str:
    return str(v) if v is not None and str(v) != "nan" else ""

def _tf_trim(v: Any) -> str:
    return str(v).strip() if v is not None and str(v) != "nan" else ""

def _tf_upper(v: Any) -> str:
    return str(v).upper().strip() if v is not None and str(v) != "nan" else ""

def _tf_pad10(v: Any) -> str:
    s = str(v).strip() if v is not None and str(v) != "nan" else ""
    if not s or s.lower() in ["none", "null", "nan", ""]:
        return ""
    if s.isdigit():
        return s.zfill(10)
    return s

def _tf_email(v: Any) -> str:
    s = str(v).strip() if v is not None and str(v) != "nan" else ""
    return s.lower()

def _tf_country(v: Any) -> str:
    s = str(v).strip().upper() if v is not None and str(v) != "nan" else ""
    return COUNTRY_MAP.get(s, s)

def _tf_currency(v: Any) -> str:
    s = str(v).strip().upper() if v is not None and str(v) != "nan" else ""
    return CURRENCY_MAP.get(s, s)

def _tf_payterm(v: Any) -> str:
    s = str(v).strip().upper() if v is not None and str(v) != "nan" else ""
    return PAYMENT_TERMS_MAP.get(s, s)

def _tf_mattype(v: Any) -> str:
    s = str(v).strip().upper() if v is not None and str(v) != "nan" else ""
    return MATERIAL_TYPE_MAP.get(s, s)

def _tf_date8(v: Any) -> str:
    s = str(v).strip() if v is not None and str(v) != "nan" else ""
    if not s or s.lower() in ["none", "null", "nan", ""]:
        return ""
    # Try dd/mm/yyyy or dd-mm-yyyy (e.g. 31/12/2023 or 31-12-2023)
    m = re.match(r"^(\d{1,2})[/\-](\d{1,2})[/\-](\d{4})$", s)
    if m:
        return f"{m.group(3)}{m.group(2).zfill(2)}{m.group(1).zfill(2)}"
    # Try yyyy-mm-dd or yyyy/mm/dd (e.g. 2023-12-31 or 2023/12/31)
    m = re.match(r"^(\d{4})[/\-](\d{1,2})[/\-](\d{1,2})$", s)
    if m:
        return f"{m.group(1)}{m.group(2).zfill(2)}{m.group(3).zfill(2)}"
    # Try yyyymmdd (8 numeric digits between 1900-2100)
    if re.match(r"^(19\d\d|20\d\d)(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])$", s):
        return s
    # Try mm/dd/yy or dd/mm/yy (2-digit year)
    m = re.match(r"^(\d{1,2})[/\-](\d{1,2})[/\-](\d{2})$", s)
    if m:
        year = f"20{m.group(3)}" if int(m.group(3)) < 50 else f"19{m.group(3)}"
        return f"{year}{m.group(1).zfill(2)}{m.group(2).zfill(2)}"
    # Try ISO timestamp with time: 2023-05-12T14:30:00 -> 20230512
    m = re.match(r"^(\d{4})[/\-](\d{2})[/\-](\d{2})[T\s]", s)
    if m:
        return f"{m.group(1)}{m.group(2)}{m.group(3)}"
    # If not parseable as a valid date, return original value without mangling or emptying
    return s

def _tf_phone(v: Any) -> str:
    s = str(v).strip() if v is not None and str(v) != "nan" else ""
    if not s or s.lower() in ["none", "null", "nan", ""]:
        return ""
    # If the string contains substantial alphabetic words (> 3 letters not part of an extension like 'ext' or 'x'),
    # it is address/text, do not strip letters
    letters = re.findall(r"[a-zA-Z]", s)
    if len(letters) > 4 and not re.search(r"(?i)\b(ext|x)\.?\s*\d+", s):
        return s
    # Clean invalid characters, preserving digits, +, -, (, ), spaces, and ext/x
    cleaned = re.sub(r"[^\d+\-\s()./xXextEXT]", "", s).strip()
    if not re.search(r"\d", cleaned):
        return s
    return cleaned

def _tf_trunc35(v: Any) -> str:
    s = str(v) if v is not None and str(v) != "nan" else ""
    return s[:35]

def _tf_quantity(v: Any) -> str:
    s = str(v).strip().upper() if v is not None and str(v) != "nan" else ""
    return QUANTITY_MAP.get(s, s)


TRANSFORMS: Dict[str, Callable] = {
    "none": _tf_none,
    "trim": _tf_trim,
    "upper": _tf_upper,
    "pad10": _tf_pad10,
    "country": _tf_country,
    "currency": _tf_currency,
    "payterm": _tf_payterm,
    "mattype": _tf_mattype,
    "quantity": _tf_quantity,
    "uom": _tf_quantity,
    "date8": _tf_date8,
    "phone": _tf_phone,
    "email": _tf_email,
    "trunc35": _tf_trunc35,
}


# ══════════════════════════════════════════════════════════
# 4. DATA CLASSES
# ══════════════════════════════════════════════════════════

class HarmonizationConfig:
    """Configuration parameters for a harmonization run."""
    def __init__(
        self,
        sap_object: str = "CUSTOMER",
        company_code: str = "1000",
        **kwargs: Any,
    ):
        self.sap_object = sap_object
        self.company_code = company_code


@dataclass
class MappingEntry:
    """A single field mapping rule: source_field → SAP_field with transform."""
    src: str
    sap: str
    transform: str = "trim"
    confidence: int = 100


@dataclass
class HarmonizationResult:
    """Output of a harmonization run."""
    final_table: pd.DataFrame
    stats: Dict[str, int] = field(default_factory=dict)
    fix_log: List[str] = field(default_factory=list)


# ══════════════════════════════════════════════════════════
# 5. HARMONIZATION AGENT
# ══════════════════════════════════════════════════════════

class HarmonizationAgent:
    """
    Parameterized agent that runs a data harmonization pipeline.

    Supports two modes:
      - run_multi_source(): Two data sources with separate mappings per source.
      - run_single_source(): One data source, direct rule application.
    """

    def __init__(self, config: HarmonizationConfig):
        self.config = config
        self.fix_log: List[str] = []
        self.stats: Dict[str, int] = {}

        # Resolve the SAP schema for the configured object (defaults to CUSTOMER)
        obj_key = config.sap_object.upper()
        self.schema = SAP_SCHEMAS.get(obj_key, SAP_SCHEMAS["CUSTOMER"])

    # ──────────────────────────────────────
    # Mapping application
    # ──────────────────────────────────────

    def _apply_mapping(
        self,
        df: pd.DataFrame,
        mappings: List[MappingEntry],
    ) -> pd.DataFrame:
        """
        Rename source columns to SAP columns per mapping entries.
        Matches src (e.g. HZ_CUST_ACCOUNTS.ACCOUNT_NUMBER) against df.columns
        whether df.columns contains full prefixed names or short fieldnames (e.g. ACCOUNT_NUMBER).
        Applies specified transform and stores result under the short SAP target field name (e.g. KUNNR).
        Unmapped source columns are preserved as-is using short field names.
        """
        if not mappings:
            # If no mapping, return dataframe with clean short column names
            renames = {col: col.split(".")[-1] for col in df.columns if "." in col}
            return df.rename(columns=renames) if renames else df.copy()

        result = pd.DataFrame(index=df.index)

        for m in mappings:
            if not m.src or not m.sap:
                continue

            src_clean = re.sub(r"^\[\d+\]", "", str(m.src).strip())
            src_lower = src_clean.lower()
            src_base = src_clean.split(".")[-1].lower()

            matched_col = None

            # Pass 1: Exact match check (full string match)
            for col in df.columns:
                col_clean = re.sub(r"^\[\d+\]", "", str(col).strip())
                if col_clean.lower() == src_lower:
                    matched_col = col
                    break

            # Pass 2: Base name match check (short field name after dot)
            if matched_col is None:
                for col in df.columns:
                    col_clean = re.sub(r"^\[\d+\]", "", str(col).strip())
                    col_base = col_clean.split(".")[-1].lower()
                    if src_base == col_base:
                        matched_col = col
                        break

            # Pass 3: Target SAP field name match check (if df columns are already mapped to SAP names)
            if matched_col is None and m.sap:
                sap_base = m.sap.split(".")[-1].lower()
                for col in df.columns:
                    col_clean = re.sub(r"^\[\d+\]", "", str(col).strip())
                    col_base = col_clean.split(".")[-1].lower()
                    if col_base == sap_base:
                        matched_col = col
                        break

            if matched_col and matched_col in df.columns:
                # ── Validate that the transform actually matches the column data ──
                # This prevents false transforms when the DB mapping has an incorrect
                # transform_rule (e.g. 'date8' stored for a city/name column).
                actual_transform = m.transform or "trim"

                if actual_transform == "date8":
                    sample_vals = [str(v).strip() for v in df[matched_col].dropna()
                                   if str(v).strip() and str(v).lower() not in ["nan", "none", "null", ""]][:20]
                    if sample_vals:
                        def _looks_like_date(v: str) -> bool:
                            return bool(
                                re.match(r"^\d{4}[/\-]\d{1,2}[/\-]\d{1,2}", v) or
                                re.match(r"^\d{1,2}[/\-]\d{1,2}[/\-]\d{2,4}", v) or
                                re.match(r"^(19|20)\d{2}(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])$", v) or
                                re.match(r"^\d{4}-\d{2}-\d{2}[T\s]", v)
                            )
                        date_ratio = sum(1 for v in sample_vals if _looks_like_date(v)) / len(sample_vals)
                        if date_ratio < 0.25:
                            actual_transform = "trim"  # Safe fallback — data doesn't look like dates

                elif actual_transform == "phone":
                    sample_vals = [str(v).strip() for v in df[matched_col].dropna()
                                   if str(v).strip() and str(v).lower() not in ["nan", "none", "null", ""]][:20]
                    if sample_vals:
                        def _looks_like_phone(v: str) -> bool:
                            letters = re.findall(r"[a-zA-Z]", v)
                            if len(letters) > 4:
                                return False
                            return len(re.findall(r"\d", v)) >= 6
                        phone_ratio = sum(1 for v in sample_vals if _looks_like_phone(v)) / len(sample_vals)
                        if phone_ratio < 0.2:
                            actual_transform = "trim"  # Safe fallback — data doesn't look like phone numbers

                elif actual_transform in ("country", "currency"):
                    sample_vals = [str(v).strip().upper() for v in df[matched_col].dropna()
                                   if str(v).strip() and str(v).lower() not in ["nan", "none", "null", ""]][:20]
                    if sample_vals:
                        avg_len = sum(len(v) for v in sample_vals) / len(sample_vals)
                        all_alpha = all(v.isalpha() for v in sample_vals)
                        if avg_len > 6 or not all_alpha:
                            actual_transform = "trim"  # Safe fallback — values are too long to be ISO codes

                tf_fn = TRANSFORMS.get(actual_transform, TRANSFORMS["trim"])
                target_col = m.sap.split(".")[-1] if "." in m.sap else m.sap

                orig_series = df[matched_col].astype(str)
                transformed_series = df[matched_col].apply(tf_fn)
                result[target_col] = transformed_series

                # Log transformations that actually changed values
                tag_map = {
                    "country": "Country→ISO",
                    "currency": "Currency→ISO",
                    "payterm": "PayTerms→SAP",
                    "mattype": "MatType→SAP",
                    "date8": "Date→YYYYMMDD",
                    "phone": "PhoneClean",
                    "email": "EmailClean",
                    "quantity": "UOM→SAP",
                    "uom": "UOM→SAP",
                    "trunc35": "Trunc35",
                    "upper": "UPPER",
                    "pad10": "Pad10",
                    "trim": "WhitespaceTrim",
                }
                tag = tag_map.get(actual_transform, f"Transform:{actual_transform}")

                diff_mask = (orig_series.str.strip() != transformed_series.astype(str).str.strip()) & (orig_series.str.strip() != "") & (orig_series.str.strip() != "nan")
                if diff_mask.any():
                    for idx in df.index[diff_mask]:
                        raw = orig_series.at[idx]
                        mapped = transformed_series.at[idx]
                        self.fix_log.append(f"[{tag}] Row {idx + 1} ({target_col}): '{raw}' → '{mapped}'")

        # Collect all mapped source field names (full and base)
        mapped_source_cols = set()
        for m in mappings:
            if m.src:
                clean_s = re.sub(r"^\[\d+\]", "", str(m.src)).strip()
                mapped_source_cols.add(clean_s.lower())
                mapped_source_cols.add(clean_s.split(".")[-1].lower())

        # Preserve only UNMAPPED source columns (columns not mapped to any SAP target)
        for col in df.columns:
            clean_c = re.sub(r"^\[\d+\]", "", str(col)).strip()
            short_col = clean_c.split(".")[-1]
            if clean_c.lower() not in mapped_source_cols and short_col.lower() not in mapped_source_cols:
                if short_col not in result.columns:
                    result[short_col] = df[col]

        # Ensure existing columns in result sync values from donor source if they are currently empty
        synonym_groups = [
            ["CITY", "CITY1", "CITY2", "HOME_CITY", "ORT01"],
            ["STATE", "REGION", "REGIO", "UF"],
            ["POST_CODE1", "POSTAL_CODE", "PSTLZ", "POSTCODE", "POST_CODE"],
            ["STREET", "STRAS", "ADDRESS1", "ADDR1"],
            ["COUNTRY", "LAND1", "COUNTRY_CODE"],
            ["KUNNR", "BPEXT", "ACCOUNT_NUMBER", "CUSTOMER_NUMBER", "PARTY_NUMBER"],
            ["NAMEORG1", "NAME1", "PARTY_NAME"],
            ["SMTP_ADDR", "EMAIL", "EMAIL_ADDRESS"],
            ["TELNR_LONG", "PHONE", "TELF1", "PHONE_NUMBER"],
            ["AKONT", "RECON_ACCOUNT"],
            ["WAERS", "CURRENCY", "CURRENCY_CODE"],
            ["ZTERM", "PAYMENT_TERMS", "PAY_TERMS"],
            ["BUKRS", "COMPANY_CODE", "ORG_ID"],
            ["VKORG", "SALES_ORG"],
            ["VTWEG", "DIST_CHANNEL"],
            ["SPART", "DIVISION"],
        ]
        for syn_group in synonym_groups:
            donor_series = None
            # Find the best donor series (with most non-empty values)
            for col_name in syn_group:
                if col_name in result.columns:
                    s = result[col_name].dropna().astype(str).str.strip()
                    valid_count = ((s != "") & (s != "nan") & (s != "none") & (s != "null")).sum()
                    if valid_count > 0:
                        donor_series = result[col_name]
                        break
            if donor_series is None:
                for col_name in syn_group:
                    for df_c in df.columns:
                        clean_df_c = re.sub(r"^\[\d+\]", "", str(df_c)).strip()
                        clean_base = clean_df_c.split(".")[-1]
                        if clean_base.upper() == col_name.upper():
                            s = df[df_c].dropna().astype(str).str.strip()
                            valid_count = ((s != "") & (s != "nan") & (s != "none") & (s != "null")).sum()
                            if valid_count > 0:
                                donor_series = df[df_c]
                                break
                    if donor_series is not None:
                        break

            if donor_series is not None:
                # ONLY fill columns that already exist in result.columns (do not inject phantom columns)
                for col_name in syn_group:
                    if col_name in result.columns:
                        curr_s = result[col_name].fillna("").astype(str).str.strip()
                        if ((curr_s == "") | (curr_s == "nan") | (curr_s == "none") | (curr_s == "null")).all():
                            result[col_name] = donor_series

        return result

    # ──────────────────────────────────────
    # Multi-source merge
    # ──────────────────────────────────────

    def _merge_sources(
        self,
        primary_df: pd.DataFrame,
        secondary_df: pd.DataFrame,
    ) -> pd.DataFrame:
        """
        Row-append merge:
          1. Column naming uses primary table's column names for all shared/SAP columns.
          2. New columns that exist only in secondary keep secondary's column names.
          3. Missing columns are filled with null (NaN).
        """
        # The primary_df columns are the "canonical" names.
        # For any column in secondary_df that already exists in primary_df → data aligns.
        # For any column in secondary_df NOT in primary_df → new column, primary rows get NaN.
        # For any column in primary_df NOT in secondary_df → secondary rows get NaN.

        merged = pd.concat([primary_df, secondary_df], ignore_index=True, sort=False)
        return merged

    # ──────────────────────────────────────
    # 7 Harmonization Rules
    # ──────────────────────────────────────

    def _rule_2_empty_filter(self, df: pd.DataFrame) -> pd.DataFrame:
        """Rule 2: Remove rows where 100% of values are empty/whitespace."""
        before = len(df)

        def row_is_empty(row: pd.Series) -> bool:
            return all(
                str(v).strip() == "" or str(v) == "nan" or v is None
                for v in row
            )

        mask = ~df.apply(row_is_empty, axis=1)
        df = df[mask]
        after = len(df)
        removed = before - after
        if removed > 0:
            self.fix_log.append(f"[EmptyFilter] Removed {removed} fully empty rows")
        self.stats["empty_removed"] = removed
        return df.reset_index(drop=True)

    def _find_country_columns(self, df: pd.DataFrame) -> List[str]:
        target_cols = []
        schema_fields = set(self.schema.get("country_fields", []))
        KNOWN_COUNTRY_COLS = {
            "LAND1", "COUNTRY", "COUNTRY_CODE", "BILLING_COUNTRY", "SHIP_COUNTRY",
            "SHIPPING_COUNTRY", "LANDX", "CTRY", "NATION", "NATIONALITY", "COUNTRY_KEY"
        }
        for col in df.columns:
            col_upper = col.upper().strip()
            base = col_upper.split(".")[-1] if "." in col_upper else col_upper
            base = re.sub(r"^\[\d+\]", "", base).strip()

            is_named_country = False
            if base in schema_fields or base in KNOWN_COUNTRY_COLS:
                is_named_country = True
            elif re.search(r'(?i)(^|[_\s])(country|country_code|land1|landx|ctry|billing_country|shipping_country)([_\s]|$)', base):
                is_named_country = True

            sample_vals = [str(v).strip().upper() for v in df[col].dropna() if str(v).strip() and str(v).lower() not in ["nan", "none", "null", ""]][:20]
            if not sample_vals:
                if is_named_country:
                    target_cols.append(col)
                continue

            country_matches = sum(1 for v in sample_vals if v in COUNTRY_MAP or v in COUNTRY_MAP_3 or (len(v) in [2, 3] and v.isalpha() and v in set(COUNTRY_MAP.values())))
            country_ratio = country_matches / len(sample_vals)

            if is_named_country and (country_ratio >= 0.15 or len(sample_vals) < 3):
                target_cols.append(col)
            elif not is_named_country and country_ratio >= 0.5:
                target_cols.append(col)

        return target_cols

    def _find_currency_columns(self, df: pd.DataFrame) -> List[str]:
        target_cols = []
        schema_fields = set(self.schema.get("currency_fields", []))
        KNOWN_CURR_COLS = {
            "WAERS", "CURRENCY", "CURRENCY_CODE", "PRICE_CURR", "DOC_CURR",
            "BASE_CURR", "ORDER_CURRENCY", "SALES_CURRENCY", "CCY"
        }
        for col in df.columns:
            col_upper = col.upper().strip()
            base = col_upper.split(".")[-1] if "." in col_upper else col_upper
            base = re.sub(r"^\[\d+\]", "", base).strip()

            is_named_curr = False
            if base in schema_fields or base in KNOWN_CURR_COLS:
                is_named_curr = True
            elif re.search(r'(?i)(^|[_\s])(currency|currency_code|waers|ccy|price_curr|doc_curr)([_\s]|$)', base):
                if not re.search(r'(?i)(current_|concurrent|recurring|occurrence)', base):
                    is_named_curr = True

            sample_vals = [str(v).strip().upper() for v in df[col].dropna() if str(v).strip() and str(v).lower() not in ["nan", "none", "null", ""]][:20]
            if not sample_vals:
                if is_named_curr:
                    target_cols.append(col)
                continue

            curr_matches = sum(1 for v in sample_vals if v in CURRENCY_MAP or (len(v) == 3 and v.isalpha() and v in set(CURRENCY_MAP.values())))
            curr_ratio = curr_matches / len(sample_vals)

            if is_named_curr and (curr_ratio >= 0.15 or len(sample_vals) < 3):
                target_cols.append(col)
            elif not is_named_curr and curr_ratio >= 0.5:
                target_cols.append(col)

        return target_cols

    def _find_payterm_columns(self, df: pd.DataFrame) -> List[str]:
        target_cols = []
        schema_fields = set(self.schema.get("payterm_fields", []))
        KNOWN_PAY_COLS = {
            "ZTERM", "PAYMENT_TERMS", "PAY_TERMS", "PAYTERMS", "PAY_TERM", "TERMS_OF_PAYMENT"
        }
        for col in df.columns:
            col_upper = col.upper().strip()
            base = col_upper.split(".")[-1] if "." in col_upper else col_upper
            base = re.sub(r"^\[\d+\]", "", base).strip()

            is_named_pay = False
            if base in schema_fields or base in KNOWN_PAY_COLS:
                is_named_pay = True
            elif re.search(r'(?i)(^|[_\s])(zterm|payment_terms?|pay_terms?|payterms?)([_\s]|$)', base):
                if not re.search(r'(?i)(payroll|payee|taxpayer|display|company|repay|overpay|pay_grade)', base):
                    is_named_pay = True

            sample_vals = [str(v).strip().upper() for v in df[col].dropna() if str(v).strip() and str(v).lower() not in ["nan", "none", "null", ""]][:20]
            if not sample_vals:
                if is_named_pay:
                    target_cols.append(col)
                continue

            pay_matches = sum(1 for v in sample_vals if v in PAYMENT_TERMS_MAP or v in set(PAYMENT_TERMS_MAP.values()))
            pay_ratio = pay_matches / len(sample_vals)

            if is_named_pay and (pay_ratio >= 0.15 or len(sample_vals) < 3):
                target_cols.append(col)
            elif not is_named_pay and pay_ratio >= 0.4:
                target_cols.append(col)

        return target_cols

    def _find_mattype_columns(self, df: pd.DataFrame) -> List[str]:
        target_cols = []
        schema_fields = set(self.schema.get("mattype_fields", []))
        KNOWN_MAT_COLS = {
            "MTART", "MATERIAL_TYPE", "MAT_TYPE", "MATTYPE"
        }
        for col in df.columns:
            col_upper = col.upper().strip()
            base = col_upper.split(".")[-1] if "." in col_upper else col_upper
            base = re.sub(r"^\[\d+\]", "", base).strip()

            is_named_mat = False
            if base in schema_fields or base in KNOWN_MAT_COLS:
                is_named_mat = True
            elif re.search(r'(?i)(^|[_\s])(mtart|material_type|mat_type|mattype)([_\s]|$)', base):
                if not re.search(r'(?i)(mat_group|material_group|matkl)', base):
                    is_named_mat = True

            sample_vals = [str(v).strip().upper() for v in df[col].dropna() if str(v).strip() and str(v).lower() not in ["nan", "none", "null", ""]][:20]
            if not sample_vals:
                if is_named_mat:
                    target_cols.append(col)
                continue

            mat_matches = sum(1 for v in sample_vals if v in MATERIAL_TYPE_MAP or v in set(MATERIAL_TYPE_MAP.values()))
            mat_ratio = mat_matches / len(sample_vals)

            if is_named_mat and (mat_ratio >= 0.15 or len(sample_vals) < 3):
                target_cols.append(col)
            elif not is_named_mat and mat_ratio >= 0.4:
                target_cols.append(col)

        return target_cols

    def _rule_1_dedup(self, df: pd.DataFrame) -> pd.DataFrame:
        """Rule 1: Key-based dedup — remove rows with duplicate key field, keep first."""
        key_field = self.schema["key_field"]
        key_col = None

        # 1. Exact or suffix match with schema key field (e.g. KUNNR, S_CUST_GEN.KUNNR)
        for col in df.columns:
            base = col.split(".")[-1] if "." in col else col
            if base == key_field:
                key_col = col
                break

        # 2. Known ERP key column names
        if key_col is None:
            for col in df.columns:
                base = col.split(".")[-1].upper() if "." in col else col.upper()
                if base in ["KUNNR", "LIFNR", "MATNR", "ACCOUNT_NUMBER", "PARTY_NUMBER", "CUSTOMER_NUMBER", "VENDOR_NUMBER", "MATERIAL_NUMBER", "ID"]:
                    key_col = col
                    break

        if key_col is None:
            self.fix_log.append(f"[Dedup] Key field '{key_field}' not found — skipping dedup")
            return df

        before = len(df)
        # Drop rows with empty key first
        df = df[df[key_col].apply(lambda v: str(v).strip() != "" and str(v) != "nan")]
        # Drop duplicate keys, keep first
        df = df.drop_duplicates(subset=[key_col], keep="first")
        after = len(df)
        removed = before - after
        if removed > 0:
            self.fix_log.append(f"[Dedup] Removed {removed} duplicate/empty-key rows on '{key_col}'")
        self.stats["deduped"] = removed
        return df.reset_index(drop=True)

    def _row_key_info(self, df: pd.DataFrame, idx: Any) -> str:
        """Find key field name and value for a row (e.g. KUNNR, LIFNR, MATNR) to enrich log messages."""
        for col in df.columns:
            base = col.split(".")[-1].upper() if "." in col else col.upper()
            if base in ["KUNNR", "LIFNR", "MATNR", "ID", "ACCOUNT_NUMBER", "CUSTOMER_NUMBER", "VENDOR_NUMBER", "MATERIAL_NUMBER"]:
                val = str(df.at[idx, col]).strip()
                if val and val != "nan":
                    return f" [{base}: {val}]"
        return ""

    def _rule_3_country_iso(self, df: pd.DataFrame, target_fields: Optional[List[str]] = None, iso_length: int = 2) -> pd.DataFrame:
        """Rule 3: Country → ISO on country fields (Vectorized). Supports 2 or 3 letter ISO codes."""
        country_cols = target_fields if target_fields else self._find_country_columns(df)
        for col in country_cols:
            if col not in df.columns:
                continue
            s_clean = df[col].astype(str).str.strip().str.upper()
            lookup_map = COUNTRY_MAP_3 if iso_length == 3 else COUNTRY_MAP
            tag_label = "Country→ISO3" if iso_length == 3 else "Country→ISO"
            mapped_series = s_clean.map(lambda v: lookup_map.get(v, v))
            diff_mask = (s_clean != mapped_series) & (s_clean != "") & (s_clean != "NAN")
            if diff_mask.any():
                for idx in df.index[diff_mask]:
                    raw = s_clean.at[idx]
                    mapped = mapped_series.at[idx]
                    key_info = self._row_key_info(df, idx)
                    self.fix_log.append(f"[{tag_label}] Row {idx + 1}{key_info} ({col}): '{raw}' → '{mapped}'")
            df[col] = mapped_series
        return df

    def _rule_4_currency_iso(self, df: pd.DataFrame, target_fields: Optional[List[str]] = None) -> pd.DataFrame:
        """Rule 4: Currency → ISO on currency fields (Vectorized)."""
        currency_cols = target_fields if target_fields else self._find_currency_columns(df)
        for col in currency_cols:
            if col not in df.columns:
                continue
            s_clean = df[col].astype(str).str.strip().str.upper()
            mapped_series = s_clean.map(lambda v: CURRENCY_MAP.get(v, v))
            diff_mask = (s_clean != mapped_series) & (s_clean != "") & (s_clean != "NAN")
            if diff_mask.any():
                for idx in df.index[diff_mask]:
                    raw = s_clean.at[idx]
                    mapped = mapped_series.at[idx]
                    key_info = self._row_key_info(df, idx)
                    self.fix_log.append(f"[Currency→ISO] Row {idx + 1}{key_info} ({col}): '{raw}' → '{mapped}'")
            df[col] = mapped_series
        return df

    def _rule_5_payterms_sap(self, df: pd.DataFrame, target_fields: Optional[List[str]] = None) -> pd.DataFrame:
        """Rule 5: Payment Terms → SAP format (Vectorized)."""
        payterm_cols = target_fields if target_fields else self._find_payterm_columns(df)
        for col in payterm_cols:
            if col not in df.columns:
                continue
            s_clean = df[col].astype(str).str.strip().str.upper()
            mapped_series = s_clean.map(lambda v: PAYMENT_TERMS_MAP.get(v, v))
            diff_mask = (s_clean != mapped_series) & (s_clean != "") & (s_clean != "NAN")
            if diff_mask.any():
                for idx in df.index[diff_mask]:
                    raw = s_clean.at[idx]
                    mapped = mapped_series.at[idx]
                    key_info = self._row_key_info(df, idx)
                    self.fix_log.append(f"[PayTerms→SAP] Row {idx + 1}{key_info} ({col}): '{raw}' → '{mapped}'")
            df[col] = mapped_series
        return df

    def _rule_6_mattype_sap(self, df: pd.DataFrame, target_fields: Optional[List[str]] = None) -> pd.DataFrame:
        """Rule 6: Material Type → SAP format (Vectorized)."""
        mattype_cols = target_fields if target_fields else self._find_mattype_columns(df)
        for col in mattype_cols:
            if col not in df.columns:
                continue
            s_clean = df[col].astype(str).str.strip().str.upper()
            mapped_series = s_clean.map(lambda v: MATERIAL_TYPE_MAP.get(v, v))
            diff_mask = (s_clean != mapped_series) & (s_clean != "") & (s_clean != "NAN")
            if diff_mask.any():
                for idx in df.index[diff_mask]:
                    raw = s_clean.at[idx]
                    mapped = mapped_series.at[idx]
                    key_info = self._row_key_info(df, idx)
                    self.fix_log.append(f"[MatType→SAP] Row {idx + 1}{key_info} ({col}): '{raw}' → '{mapped}'")
            df[col] = mapped_series
        return df

    def _rule_7_whitespace_trim(self, df: pd.DataFrame, target_fields: Optional[List[str]] = None, mode: str = "both") -> pd.DataFrame:
        """Rule 7: Trim whitespace on fields (Vectorized). Mode: 'both', 'left', 'right'."""
        cols = target_fields if target_fields else list(df.columns)
        trimmed_count = 0
        for col in cols:
            if col not in df.columns:
                continue
            s = df[col].astype(str)
            if mode == "left":
                s_clean = s.str.lstrip().replace("nan", "")
            elif mode == "right":
                s_clean = s.str.rstrip().replace("nan", "")
            else:
                s_clean = s.str.strip().replace("nan", "")

            diff_mask = (s != s_clean) & (s != "") & (s != "nan")
            if diff_mask.any():
                count_in_col = diff_mask.sum()
                trimmed_count += count_in_col
                self.fix_log.append(f"[WhitespaceTrim] Trimmed {count_in_col} values in '{col}'")
                for idx in df.index[diff_mask]:
                    raw = s.at[idx]
                    mapped = s_clean.at[idx]
                    key_info = self._row_key_info(df, idx)
                    self.fix_log.append(f"[WhitespaceTrim::Detail] Row {idx + 1}{key_info} ({col}): '{raw}' → '{mapped}'")
            df[col] = s_clean
        return df

    # ──────────────────────────────────────
    # Rules 8-11 Helpers: Date, Phone, UOM, Text
    # ──────────────────────────────────────

    def _find_date_columns(self, df: pd.DataFrame) -> List[str]:
        """Auto-detect date columns with strict name matching and data validation."""
        DATE_NAME_PATTERNS = {
            "ERDAT", "AEDAT", "ERNAM_DATE", "BUDAT", "BLDAT", "CPUDT",
            "FKDAT", "AUDAT", "VDATU", "BDATU", "PSODT", "BEDAT", "GBDAT",
            "START_DATE", "END_DATE", "BIRTH_DATE", "HIRE_DATE", "EFFECTIVE_DATE",
            "CREATION_DATE", "EXPIRATION_DATE", "MODIFIED_DATE", "DOB", "DATE_OF_BIRTH",
            "VALID_FROM", "VALID_TO", "POSTING_DATE", "DOC_DATE", "ENTRY_DATE"
        }

        def is_date_format(val: str) -> bool:
            v = str(val).strip()
            if not v or v.lower() in ["nan", "none", "null", ""]:
                return False
            # Check YYYY-MM-DD or YYYY/MM/DD
            if re.match(r"^\d{4}[/\-]\d{1,2}[/\-]\d{1,2}", v):
                return True
            # Check DD/MM/YYYY or DD-MM-YYYY or MM/DD/YYYY
            if re.match(r"^\d{1,2}[/\-]\d{1,2}[/\-]\d{2,4}", v):
                return True
            # Check YYYYMMDD (8 digits between year 1900-2100)
            if re.match(r"^(19\d\d|20\d\d)(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])$", v):
                return True
            # Check ISO timestamp e.g. 2023-05-12T14:30:00
            if re.match(r"^\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}:\d{2}", v):
                return True
            return False

        target_cols = []
        for col in df.columns:
            col_upper = col.upper().strip()
            base = col_upper.split(".")[-1] if "." in col_upper else col_upper
            base = re.sub(r"^\[\d+\]", "", base).strip()

            is_named_date = False
            if base in DATE_NAME_PATTERNS:
                is_named_date = True
            elif re.search(r'(?i)(^|[_\s])(date|dob|datu|valid_from|valid_to|birth_date|hire_date|effective_date)([_\s\d]|$)', base):
                # Avoid false positives like "Effective-dated: No", "Candidate", "Validate", "Accommodation"
                if not re.search(r'(?i)(dated:\s*(no|yes)|candidate|validate|validation|accommodat|foundation|mandat)', base):
                    is_named_date = True

            sample_vals = [str(v).strip() for v in df[col].dropna() if str(v).strip() and str(v).lower() not in ["nan", "none", "null", ""]][:20]
            if not sample_vals:
                if is_named_date:
                    target_cols.append(col)
                continue

            date_matches = sum(1 for v in sample_vals if is_date_format(v))
            date_ratio = date_matches / len(sample_vals)

            if is_named_date and date_ratio >= 0.25:
                target_cols.append(col)
            elif not is_named_date and date_ratio >= 0.6:
                target_cols.append(col)

        return target_cols

    def _find_phone_columns(self, df: pd.DataFrame) -> List[str]:
        """Auto-detect phone/fax columns with strict name matching and sample check."""
        PHONE_NAMES = {
            "TELF1", "TELF2", "TELFX", "TELMOB", "TEL_NUMBER", "TELNR",
            "FAX_NUMBER", "PHONE_NUMBER", "MOBILE_NUMBER", "TELEPHONE",
            "CELL_PHONE", "PHONE", "FAX", "MOBILE"
        }
        target_cols = []
        for col in df.columns:
            col_upper = col.upper().strip()
            base = col_upper.split(".")[-1] if "." in col_upper else col_upper
            base = re.sub(r"^\[\d+\]", "", base).strip()

            is_named_phone = False
            if base in PHONE_NAMES:
                is_named_phone = True
            elif re.search(r'(?i)(^|[_\s])(phone|fax|mobile|telephone|cell_phone|telf\d*|telfx|telmob|telnr)([_\s]|$)', base):
                if not re.search(r'(?i)(cell_tower|excellent|cancelled|parcel|headphone|microphone)', base):
                    is_named_phone = True

            sample_vals = [str(v).strip() for v in df[col].dropna() if str(v).strip() and str(v).lower() not in ["nan", "none", "null", ""]][:20]
            if not sample_vals:
                if is_named_phone:
                    target_cols.append(col)
                continue

            def is_phone_like(val: str) -> bool:
                letters = re.findall(r"[a-zA-Z]", val)
                if len(letters) > 4 and not re.search(r"(?i)\b(ext|x)\.?\s*\d+", val):
                    return False
                digits = re.findall(r"\d", val)
                return len(digits) >= 6

            phone_matches = sum(1 for v in sample_vals if is_phone_like(v))
            phone_ratio = phone_matches / len(sample_vals)

            if is_named_phone and (phone_ratio >= 0.2 or len(sample_vals) < 3):
                target_cols.append(col)
            elif not is_named_phone and phone_ratio >= 0.6:
                target_cols.append(col)

        return target_cols

    def _find_uom_columns(self, df: pd.DataFrame) -> List[str]:
        """Auto-detect unit-of-measure columns by name patterns and data sampling."""
        UOM_NAMES = {
            "MEINS", "BSTME", "GEWEI", "VOLEH", "LMEIN", "UOM",
            "BASE_UOM", "UNIT_OF_MEASURE", "BASE_UNIT", "ORDER_UOM"
        }
        target_cols = []
        for col in df.columns:
            col_upper = col.upper().strip()
            base = col_upper.split(".")[-1] if "." in col_upper else col_upper
            base = re.sub(r"^\[\d+\]", "", base).strip()

            is_named_uom = False
            if base in UOM_NAMES:
                is_named_uom = True
            elif re.search(r'(?i)(^|[_\s])(meins|bstme|gewei|voleh|lmein|uom|base_uom|unit_of_measure)([_\s]|$)', base):
                if not re.search(r'(?i)(business_unit|org_unit|organization_unit|community)', base):
                    is_named_uom = True

            sample_vals = [str(v).strip().upper() for v in df[col].dropna() if str(v).strip() and str(v).lower() not in ["nan", "none", "null", ""]][:20]
            if not sample_vals:
                if is_named_uom:
                    target_cols.append(col)
                continue

            uom_matches = sum(1 for v in sample_vals if v in QUANTITY_MAP or v in set(QUANTITY_MAP.values()))
            uom_ratio = uom_matches / len(sample_vals)

            if is_named_uom and (uom_ratio >= 0.15 or len(sample_vals) < 3):
                target_cols.append(col)
            elif not is_named_uom and uom_ratio >= 0.5:
                target_cols.append(col)

        return target_cols

    def _find_text_columns(self, df: pd.DataFrame) -> List[str]:
        """Auto-detect name/address text fields that should be truncated to 35 chars."""
        TEXT_NAMES = {
            "NAME1", "NAME2", "NAME3", "NAME4",
            "ORT01", "ORT02", "STRAS", "PSTLZ",
            "SORTL", "MCOD1", "MCOD2", "MCOD3",
            "STREET", "CITY", "FIRST_NAME", "LAST_NAME",
            "NAME_FIRST", "NAME_LAST"
        }
        target_cols = []
        for col in df.columns:
            col_upper = col.upper().strip()
            base = col_upper.split(".")[-1] if "." in col_upper else col_upper
            base = re.sub(r"^\[\d+\]", "", base).strip()

            if base in TEXT_NAMES:
                target_cols.append(col)
            elif re.search(r'(?i)(^|[_\s])(name\d*|first_name|last_name|street|city|district|address_line\d*)([_\s]|$)', base):
                target_cols.append(col)

        return target_cols

    def _rule_8_date_format(self, df: pd.DataFrame, target_fields: Optional[List[str]] = None, target_format: str = "YYYYMMDD") -> pd.DataFrame:
        """Rule 8: Date format on date columns."""
        date_cols = target_fields if target_fields else self._find_date_columns(df)
        for col in date_cols:
            if col not in df.columns:
                continue
            original = df[col].astype(str).str.strip()
            formatted = original.apply(_tf_date8)
            diff_mask = (original != formatted) & (original != "") & (original != "nan")
            if diff_mask.any():
                changed = diff_mask.sum()
                self.fix_log.append(f"[Date→{target_format}] Formatted {changed} values in '{col}'")
                for idx in df.index[diff_mask]:
                    raw = original.at[idx]
                    mapped = formatted.at[idx]
                    key_info = self._row_key_info(df, idx)
                    self.fix_log.append(f"[Date→{target_format}::Detail] Row {idx + 1}{key_info} ({col}): '{raw}' → '{mapped}'")
            df[col] = formatted
        return df

    def _rule_9_phone_clean(self, df: pd.DataFrame, target_fields: Optional[List[str]] = None, keep_plus: bool = True) -> pd.DataFrame:
        """Rule 9: Phone/Fax cleanup — remove invalid characters."""
        phone_cols = target_fields if target_fields else self._find_phone_columns(df)
        for col in phone_cols:
            if col not in df.columns:
                continue
            original = df[col].astype(str).str.strip()
            cleaned = original.apply(_tf_phone)
            diff_mask = (original != cleaned) & (original != "") & (original != "nan")
            if diff_mask.any():
                changed = diff_mask.sum()
                self.fix_log.append(f"[PhoneClean] Cleaned {changed} values in '{col}'")
                for idx in df.index[diff_mask]:
                    raw = original.at[idx]
                    mapped = cleaned.at[idx]
                    key_info = self._row_key_info(df, idx)
                    self.fix_log.append(f"[PhoneClean::Detail] Row {idx + 1}{key_info} ({col}): '{raw}' → '{mapped}'")
            df[col] = cleaned
        return df

    def _rule_10_uom_normalize(self, df: pd.DataFrame, target_fields: Optional[List[str]] = None) -> pd.DataFrame:
        """Rule 10: UOM → SAP format on unit-of-measure columns."""
        uom_cols = target_fields if target_fields else self._find_uom_columns(df)
        for col in uom_cols:
            if col not in df.columns:
                continue
            s_clean = df[col].astype(str).str.strip().str.upper()
            mapped_series = s_clean.map(lambda v: QUANTITY_MAP.get(v, v))
            diff_mask = (s_clean != mapped_series) & (s_clean != "") & (s_clean != "NAN")
            if diff_mask.any():
                for idx in df.index[diff_mask]:
                    raw = s_clean.at[idx]
                    mapped = mapped_series.at[idx]
                    key_info = self._row_key_info(df, idx)
                    self.fix_log.append(f"[UOM→SAP] Row {idx + 1}{key_info} ({col}): '{raw}' → '{mapped}'")
            df[col] = mapped_series
        return df

    def _rule_11_trunc35(self, df: pd.DataFrame, target_fields: Optional[List[str]] = None, max_length: int = 35) -> pd.DataFrame:
        """Rule 11: Truncate name/address fields to max_length characters (SAP standard)."""
        text_cols = target_fields if target_fields else self._find_text_columns(df)
        truncated_count = 0
        for col in text_cols:
            if col not in df.columns:
                continue
            original = df[col].astype(str)
            truncated = original.str[:max_length]
            diff_mask = original.str.len() > max_length
            if diff_mask.any():
                count_in_col = diff_mask.sum()
                truncated_count += count_in_col
                self.fix_log.append(f"[Trunc35] Truncated {count_in_col} values in '{col}' to {max_length} chars")
                for idx in df.index[diff_mask]:
                    raw = original.at[idx]
                    mapped = truncated.at[idx]
                    key_info = self._row_key_info(df, idx)
                    self.fix_log.append(f"[Trunc35::Detail] Row {idx + 1}{key_info} ({col}): '{raw}' → '{mapped}'")
            df[col] = truncated
        return df

    # Default rule configuration
    DEFAULT_RULE_CONFIG = {
        "dedup": {"enabled": True},
        "empty_filter": {"enabled": True},
        "country_iso": {"enabled": True},
        "currency_iso": {"enabled": True},
        "whitespace_trim": {"enabled": True},
        "date_format": {"enabled": True},
        "phone_clean": {"enabled": True},
    }

    def _apply_rules(self, df: pd.DataFrame, rule_config: Optional[Dict[str, Any]] = None) -> pd.DataFrame:
        """Apply harmonization rules in order, respecting rule_config toggles and params."""
        cfg = {**self.DEFAULT_RULE_CONFIG}
        if rule_config:
            for k, v in rule_config.items():
                if k in cfg:
                    cfg[k] = {**cfg[k], **v}

        if cfg.get("dedup", {}).get("enabled", True):
            df = self._rule_1_dedup(df)
        if cfg.get("empty_filter", {}).get("enabled", True):
            df = self._rule_2_empty_filter(df)
        if cfg.get("country_iso", {}).get("enabled", True):
            iso_len = cfg["country_iso"].get("params", {}).get("iso_length", 2)
            tf = cfg["country_iso"].get("params", {}).get("target_fields")
            df = self._rule_3_country_iso(df, target_fields=tf, iso_length=iso_len)
        if cfg.get("currency_iso", {}).get("enabled", True):
            tf = cfg["currency_iso"].get("params", {}).get("target_fields")
            df = self._rule_4_currency_iso(df, target_fields=tf)
        if cfg.get("whitespace_trim", {}).get("enabled", True):
            mode = cfg["whitespace_trim"].get("params", {}).get("mode", "both")
            tf = cfg["whitespace_trim"].get("params", {}).get("target_fields")
            df = self._rule_7_whitespace_trim(df, target_fields=tf, mode=mode)
        if cfg.get("date_format", {}).get("enabled", True):
            fmt = cfg["date_format"].get("params", {}).get("format", "YYYYMMDD")
            tf = cfg["date_format"].get("params", {}).get("target_fields")
            df = self._rule_8_date_format(df, target_fields=tf, target_format=fmt)
        if cfg.get("phone_clean", {}).get("enabled", True):
            kp = cfg["phone_clean"].get("params", {}).get("keep_plus", True)
            tf = cfg["phone_clean"].get("params", {}).get("target_fields")
            df = self._rule_9_phone_clean(df, target_fields=tf, keep_plus=kp)
        return df

    # ──────────────────────────────────────
    # Helper: find a column in the DataFrame
    # ──────────────────────────────────────

    def _find_column(self, df: pd.DataFrame, field_name: str) -> Optional[str]:
        """
        Find a column that matches the given SAP field name.
        Handles both plain names (LAND1) and prefixed names (S_CUST_GEN.LAND1).
        """
        if field_name in df.columns:
            return field_name
        # Check if any column ends with .FIELD_NAME
        for col in df.columns:
            if "." in col and col.split(".")[-1] == field_name:
                return col
        return None

    # ──────────────────────────────────────
    # Public entry points
    # ──────────────────────────────────────

    def apply_dynamic_rules(
        self,
        df: pd.DataFrame,
        dynamic_rules: List[Dict[str, Any]],
    ) -> pd.DataFrame:
        """
        Apply LLM-generated dynamic harmonization rules.
        Each rule has: {id, label, description, target_field, python_code}.
        python_code is a function body: `def transform(value, row): -> str`
        """
        if not dynamic_rules:
            return df

        for rule in dynamic_rules:
            rule_id = rule.get("id", "DYNAMIC")
            label = rule.get("label", rule_id)
            target_field = rule.get("target_field", "")
            python_code = rule.get("python_code", "")

            if not python_code or not target_field:
                self.fix_log.append(f"[DynamicAI] Skipping rule '{label}' — missing code or target field")
                continue

            # Find the actual column in df
            actual_col = None
            for col in df.columns:
                if col.upper() == target_field.upper() or col.split('.')[-1].upper() == target_field.upper():
                    actual_col = col
                    break

            if actual_col is None:
                self.fix_log.append(f"[DynamicAI] Skipping rule '{label}' — field '{target_field}' not found in data")
                continue

            try:
                # Build the transform function from LLM code
                exec_globals = {"re": re, "pd": pd}
                exec(python_code, exec_globals)
                transform_fn = exec_globals.get("transform")
                if not callable(transform_fn):
                    self.fix_log.append(f"[DynamicAI] Skipping rule '{label}' — no callable 'transform' function")
                    continue

                changed_count = 0
                for idx in df.index:
                    old_val = str(df.at[idx, actual_col]) if df.at[idx, actual_col] is not None else ""
                    row_dict = {k: str(v) if v is not None else "" for k, v in df.iloc[idx].to_dict().items()}
                    try:
                        new_val = str(transform_fn(old_val, row_dict))
                    except Exception:
                        new_val = old_val
                    if new_val != old_val:
                        df.at[idx, actual_col] = new_val
                        changed_count += 1
                        if changed_count <= 5:
                            key_info = self._row_key_info(df, idx)
                            self.fix_log.append(f"[DynamicAI] Row {idx + 1}{key_info} ({actual_col}): '{old_val[:30]}' → '{new_val[:30]}'")

                if changed_count > 5:
                    self.fix_log.append(f"[DynamicAI] ... and {changed_count - 5} more changes for '{label}'")
                elif changed_count == 0:
                    self.fix_log.append(f"[DynamicAI] Rule '{label}' — no changes needed")

            except Exception as e:
                self.fix_log.append(f"[DynamicAI] Error executing rule '{label}': {str(e)[:100]}")

        return df

    def run_multi_source(
        self,
        primary_df: pd.DataFrame,
        secondary_df: pd.DataFrame,
        primary_mappings: List[MappingEntry],
        secondary_mappings: List[MappingEntry],
        primary_source: str = "SAP_ECC",
        secondary_source: str = "ORACLE_EBS",
        additional_sources: Optional[List[Dict[str, Any]]] = None,
        preview_only: bool = False,
        rule_config: Optional[Dict[str, Any]] = None,
        dynamic_rules: Optional[List[Dict[str, Any]]] = None,
    ) -> HarmonizationResult:
        """
        Mode 1: Multi-source harmonization pipeline.
        Supports N additional sources beyond primary + secondary.
        preview_only=True returns fix_log without mutating data.
        """
        self.fix_log = []
        self.stats = {}

        total_input = len(primary_df) + len(secondary_df)
        self.stats["total_input"] = total_input
        self.stats["primary_rows"] = len(primary_df)
        self.stats["secondary_rows"] = len(secondary_df)

        self.fix_log.append(
            f"[Init] Multi-source mode: {len(primary_df)} primary ({primary_source}) + "
            f"{len(secondary_df)} secondary ({secondary_source}) rows"
        )

        # Work on copies for preview mode
        work_primary = primary_df.copy() if preview_only else primary_df
        work_secondary = secondary_df.copy() if preview_only else secondary_df

        # Step 1: Apply mappings
        mapped_primary = self._apply_mapping(work_primary, primary_mappings)
        mapped_secondary = self._apply_mapping(work_secondary, secondary_mappings)

        # Step 2: Assign SOURCE tracking column
        mapped_primary["SOURCE"] = primary_source
        mapped_secondary["SOURCE"] = secondary_source

        self.fix_log.append(
            f"[Mapping] Primary ({primary_source}): {len(primary_df.columns)} cols → "
            f"{len(mapped_primary.columns)} cols"
        )
        self.fix_log.append(
            f"[Mapping] Secondary ({secondary_source}): {len(secondary_df.columns)} cols → "
            f"{len(mapped_secondary.columns)} cols"
        )

        # Step 3: Row-append merge
        merged = self._merge_sources(mapped_primary, mapped_secondary)

        # Merge additional sources
        if additional_sources:
            for extra in additional_sources:
                extra_df = extra["df"]
                extra_mappings = extra.get("mappings", [])
                extra_source = extra.get("source_name", "EXTRA")
                total_input += len(extra_df)
                self.stats[f"{extra_source.lower()}_rows"] = len(extra_df)

                mapped_extra = self._apply_mapping(extra_df.copy() if preview_only else extra_df, extra_mappings)
                mapped_extra["SOURCE"] = extra_source
                self.fix_log.append(
                    f"[Mapping] Additional ({extra_source}): {len(extra_df.columns)} cols → "
                    f"{len(mapped_extra.columns)} cols"
                )
                merged = self._merge_sources(merged, mapped_extra)

        self.stats["total_input"] = total_input
        self.fix_log.append(
            f"[Merge] Merged table: {len(merged)} rows × {len(merged.columns)} columns"
        )

        # Log new columns from secondary
        primary_cols = set(mapped_primary.columns)
        secondary_only_cols = [c for c in mapped_secondary.columns if c not in primary_cols]
        if secondary_only_cols:
            self.fix_log.append(
                f"[Merge] New columns from secondary: {secondary_only_cols}"
            )

        # Step 4: Apply harmonization rules
        harmonized = self._apply_rules(merged, rule_config=rule_config)

        # Step 4b: Apply dynamic AI rules
        if dynamic_rules:
            harmonized = self.apply_dynamic_rules(harmonized, dynamic_rules)

        # Step 5: Format final column headers to short SAP field names (part after dot)
        rename_dict = {col: col.split(".")[-1] for col in harmonized.columns if "." in col}
        if rename_dict:
            harmonized = harmonized.rename(columns=rename_dict)
            self.fix_log.append(f"[ColumnNaming] Formatted final output columns with short field names (after dot)")

        # Step 6: Ensure SOURCE column is placed at the very end of the output table
        if "SOURCE" in harmonized.columns:
            cols = [c for c in harmonized.columns if c != "SOURCE"] + ["SOURCE"]
            harmonized = harmonized[cols]

        self.stats["total_output"] = len(harmonized)
        self.stats["columns"] = len(harmonized.columns)

        if preview_only:
            return HarmonizationResult(
                final_table=pd.DataFrame(),
                stats=self.stats,
                fix_log=self.fix_log,
            )

        return HarmonizationResult(
            final_table=harmonized,
            stats=self.stats,
            fix_log=self.fix_log,
        )

    def run_single_source(
        self,
        source_df: pd.DataFrame,
        mappings: Optional[List[MappingEntry]] = None,
        primary_source: str = "SAP_ECC",
        preview_only: bool = False,
        rule_config: Optional[Dict[str, Any]] = None,
        dynamic_rules: Optional[List[Dict[str, Any]]] = None,
    ) -> HarmonizationResult:
        """
        Mode 2: Single-source harmonization pipeline.
        preview_only=True returns fix_log without mutating data.
        """
        self.fix_log = []
        self.stats = {}

        work_df = source_df.copy() if preview_only else source_df
        total_input = len(work_df)
        self.stats["total_input"] = total_input

        self.fix_log.append(
            f"[Init] Single-source mode ({primary_source}): {total_input} rows × "
            f"{len(work_df.columns)} columns"
        )

        if mappings:
            # Check if first row is accidentally the source headers
            if not work_df.empty:
                first_row_vals = set(str(v).strip().lower() for v in work_df.iloc[0].values)
                src_names = set(re.sub(r"^\[\d+\]", "", str(m.src)).split(".")[-1].lower() if "." in str(m.src) else re.sub(r"^\[\d+\]", "", str(m.src)).lower() for m in mappings)
                if len(first_row_vals.intersection(src_names)) >= 2:
                    work_df = work_df.drop(0).reset_index(drop=True)
                    self.fix_log.append("[HeaderCleanup] Removed first row because it contained source column headers.")

            mapped_df = self._apply_mapping(work_df, mappings)
            mapped_df["SOURCE"] = primary_source
            harmonized = self._apply_rules(mapped_df, rule_config=rule_config)
        else:
            df_copy = work_df.copy()
            df_copy["SOURCE"] = primary_source
            harmonized = self._apply_rules(df_copy, rule_config=rule_config)

        # Apply dynamic AI rules
        if dynamic_rules:
            harmonized = self.apply_dynamic_rules(harmonized, dynamic_rules)

        # Strip table prefix if present (e.g. HZ_LOCATIONS.COUNTRY -> COUNTRY)
        rename_dict = {col: col.split(".")[-1] for col in harmonized.columns if "." in col}
        if rename_dict:
            harmonized = harmonized.rename(columns=rename_dict)
            self.fix_log.append(f"[ColumnNaming] Formatted final output columns with short field names (after dot)")

        # Ensure SOURCE column is placed at the very end of the output table
        if "SOURCE" in harmonized.columns:
            cols = [c for c in harmonized.columns if c != "SOURCE"] + ["SOURCE"]
            harmonized = harmonized[cols]

        self.stats["total_output"] = len(harmonized)
        self.stats["columns"] = len(harmonized.columns)

        if preview_only:
            return HarmonizationResult(
                final_table=pd.DataFrame(),
                stats=self.stats,
                fix_log=self.fix_log,
            )

        return HarmonizationResult(
            final_table=harmonized,
            stats=self.stats,
            fix_log=self.fix_log,
        )


# ══════════════════════════════════════════════════════════
# 6. UTILITY FUNCTIONS
# ══════════════════════════════════════════════════════════

def load_data_file(file_path: str) -> pd.DataFrame:
    """Load a CSV or Excel file into a DataFrame."""
    if file_path.endswith(".xlsx") or file_path.endswith(".xls"):
        return pd.read_excel(file_path, dtype=str).fillna("")
    else:
        return pd.read_csv(file_path, dtype=str).fillna("")


def _extract_mapping_entry(row: pd.Series) -> Optional[MappingEntry]:
    row_dict = {str(k).strip().lower(): str(v).strip() for k, v in row.items()}

    src = (
        row_dict.get("src")
        or row_dict.get("source field")
        or row_dict.get("source_field")
        or row_dict.get("source")
        or ""
    )
    sap = (
        row_dict.get("sap")
        or row_dict.get("sap field")
        or row_dict.get("sap_field")
        or row_dict.get("target field")
        or row_dict.get("target_field")
        or row_dict.get("target")
        or ""
    )
    transform = (
        row_dict.get("transform")
        or row_dict.get("transform_rule")
        or row_dict.get("tr")
        or "trim"
    )
    conf_str = (
        row_dict.get("confidence")
        or row_dict.get("confidence_score")
        or row_dict.get("conf")
        or "100"
    )

    try:
        confidence = int(conf_str)
    except ValueError:
        confidence = 100

    if src and sap:
        return MappingEntry(
            src=src,
            sap=sap,
            transform=transform if transform else "trim",
            confidence=confidence,
        )
    return None


def load_mapping_file(file_path: str) -> List[MappingEntry]:
    """Load a mapping CSV file with flexible column header matching."""
    df = pd.read_csv(file_path, dtype=str).fillna("")
    mappings = []
    for _, row in df.iterrows():
        entry = _extract_mapping_entry(row)
        if entry:
            mappings.append(entry)
    return mappings


def parse_mapping_from_upload(content: bytes, filename: str) -> List[MappingEntry]:
    """Parse mapping from uploaded file bytes with flexible column header matching."""
    if filename.endswith(".xlsx") or filename.endswith(".xls"):
        df = pd.read_excel(io.BytesIO(content), dtype=str).fillna("")
    else:
        df = pd.read_csv(io.BytesIO(content), dtype=str).fillna("")

    mappings = []
    for _, row in df.iterrows():
        entry = _extract_mapping_entry(row)
        if entry:
            mappings.append(entry)
    return mappings


def parse_data_from_upload(content: bytes, filename: str) -> pd.DataFrame:
    """Parse data from uploaded file bytes."""
    if filename.endswith(".xlsx") or filename.endswith(".xls"):
        df = pd.read_excel(io.BytesIO(content), dtype=str).fillna("")
    else:
        df = pd.read_csv(io.BytesIO(content), dtype=str).fillna("")

    if not df.empty and len(df) > 0:
        first_row_vals = [str(v).strip() for v in df.iloc[0].values]
        col_bases = [str(col).split('.')[0] for col in df.columns]
        if len(col_bases) != len(set(col_bases)) and len(set(first_row_vals)) == len(first_row_vals):
            df.columns = first_row_vals
            df = df.iloc[1:].reset_index(drop=True)

    return df


# ══════════════════════════════════════════════════════════
# 7. CLI ENTRY POINT
# ══════════════════════════════════════════════════════════

def main():
    parser = argparse.ArgumentParser(
        description="Harmonization Agent — Parameterized Data Harmonization Engine"
    )
    parser.add_argument(
        "--mode", choices=["single", "multi"], required=True,
        help="Harmonization mode: 'single' for one source, 'multi' for primary+secondary"
    )
    parser.add_argument("--primary", required=True, help="Path to primary data file (CSV/Excel)")
    parser.add_argument("--secondary", help="Path to secondary data file (multi mode only)")
    parser.add_argument("--primary-mapping", help="Path to primary mapping CSV (multi mode only)")
    parser.add_argument("--secondary-mapping", help="Path to secondary mapping CSV (multi mode only)")
    parser.add_argument(
        "--object", choices=["CUSTOMER", "VENDOR", "MATERIAL"], default="CUSTOMER",
        help="SAP target object type"
    )
    parser.add_argument("--output", default="harmonized_output.csv", help="Output CSV file path")
    parser.add_argument("--company-code", default="1000")
    parser.add_argument("--sales-org", default="1000")
    parser.add_argument("--purch-org", default="1000")
    parser.add_argument("--plant", default="1000")
    parser.add_argument("--dist-channel", default="10")
    parser.add_argument("--division", default="00")
    parser.add_argument("--currency", default="INR")

    args = parser.parse_args()

    # Build config
    config = HarmonizationConfig(
        sap_object=args.object,
        company_code=args.company_code,
        sales_org=args.sales_org,
        purch_org=args.purch_org,
        plant=args.plant,
        dist_channel=args.dist_channel,
        division=args.division,
        currency=args.currency,
    )

    agent = HarmonizationAgent(config)

    if args.mode == "single":
        print(f"📂 Loading primary data from: {args.primary}")
        primary_df = load_data_file(args.primary)
        print(f"   → {len(primary_df)} rows × {len(primary_df.columns)} columns")

        print("\n🔄 Running single-source harmonization...")
        result = agent.run_single_source(primary_df)

    elif args.mode == "multi":
        if not args.secondary:
            print("❌ --secondary is required for multi mode")
            sys.exit(1)
        if not args.primary_mapping:
            print("❌ --primary-mapping is required for multi mode")
            sys.exit(1)
        if not args.secondary_mapping:
            print("❌ --secondary-mapping is required for multi mode")
            sys.exit(1)

        print(f"📂 Loading primary data from: {args.primary}")
        primary_df = load_data_file(args.primary)
        print(f"   → {len(primary_df)} rows × {len(primary_df.columns)} columns")

        print(f"📂 Loading secondary data from: {args.secondary}")
        secondary_df = load_data_file(args.secondary)
        print(f"   → {len(secondary_df)} rows × {len(secondary_df.columns)} columns")

        print(f"📋 Loading primary mapping from: {args.primary_mapping}")
        primary_mappings = load_mapping_file(args.primary_mapping)
        print(f"   → {len(primary_mappings)} mapping entries")

        print(f"📋 Loading secondary mapping from: {args.secondary_mapping}")
        secondary_mappings = load_mapping_file(args.secondary_mapping)
        print(f"   → {len(secondary_mappings)} mapping entries")

        print("\n🔄 Running multi-source harmonization...")
        result = agent.run_multi_source(
            primary_df, secondary_df, primary_mappings, secondary_mappings
        )

    # Output
    print("\n" + "═" * 60)
    print("📊 HARMONIZATION RESULTS")
    print("═" * 60)

    for key, val in result.stats.items():
        print(f"  {key}: {val}")

    print(f"\n📝 Fix Log ({len(result.fix_log)} entries):")
    for log_entry in result.fix_log:
        print(f"  {log_entry}")

    # Save output
    result.final_table.to_csv(args.output, index=False)
    print(f"\n✅ Final table saved to: {args.output}")
    print(f"   {len(result.final_table)} rows × {len(result.final_table.columns)} columns")


if __name__ == "__main__":
    main()
