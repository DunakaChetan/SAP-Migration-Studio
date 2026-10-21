import os
import random
from collections import Counter

import pandas as pd

NUM_RECORDS = 1200

# Keep the requested Infor LN table/field order. Qualify only repeated field
# names so the generic two-row workbook importer can identify the headers.
FIELD_PAIRS = [
    ("tccom100", "bpid"),
    ("tccom100", "nama"),
    ("tccom100", "sort"),
    ("tccom100", "ctry"),
    ("tccom100", "lang"),
    ("tccom100", "telp"),
    ("tccom100", "faxn"),
    ("tccom100", "email"),
    ("tccom130", "cadr"),
    ("tccom130", "add1"),
    ("tccom130", "add2"),
    ("tccom130", "city"),
    ("tccom130", "stat"),
    ("tccom130", "pstc"),
    ("tccom130", "ctry"),
    ("tccom140", "cont"),
    ("tccom140", "telp"),
    ("tccom140", "email"),
    ("tccom110", "cuno"),
    ("tccom110", "namn"),
    ("tccom110", "cgrp"),
    ("tccom110", "taxn"),
    ("tccom110", "curr"),
    ("tccom112", "billto"),
    ("tccom111", "shipto"),
    ("tccom114", "payer"),
    ("tccom110", "pymt"),
    ("tccom110", "recon"),
    ("tccom110", "dunn"),
    ("tccom110", "paym"),
    ("tccom110", "slso"),
    ("tccom110", "dist"),
    ("tccom110", "divi"),
    ("tccom110", "inco"),
    ("tccom110", "pric"),
    ("tccom110", "custp"),
    ("tccom110", "shipc"),
    ("tccom110", "salesoff"),
    ("tccom110", "salesgrp"),
    ("tccom110", "delblk"),
    ("tccom110", "ordblk"),
    ("tccom110", "credlim"),
    ("tccom110", "riskcat"),
]

header_row_1 = [table for table, _ in FIELD_PAIRS]
field_counts = Counter(field for _, field in FIELD_PAIRS)
header_row_2 = [
    f"{table}.{field}" if field_counts[field] > 1 else field
    for table, field in FIELD_PAIRS
]

company_types = ["SAS", "LLC", "INC", "S.A.", "CORP"]
names_base = [
    "ADMINISTRADORA COUNTRY",
    "AM MEDICAL",
    "ANGIOGRAFIA DE COLOMBIA",
    "ANGIOGRAFIA DE OCCIDENTE",
    "TECH SOLUTIONS",
    "GLOBAL LOGISTICS",
    "MEDICAL DEVICES",
    "INFOR CORP",
    "ACME CORP",
    "STARK IND",
]
cities = ["Bogota", "Cali", "Medellin", "New York", "London", "Berlin"]
states = ["CUN", "VAC", "ANT", "NY", "LND", "BER"]
countries = ["CO", "US", "DE", "GB", "IN"]
bad_countries = [
    "Colombia",
    "United States",
    "Germany",
    "United Kingdom",
    "India",
    "INVALID_COUNTRY",
]
bad_emails = [
    "not_an_email",
    "admin@.com",
    "missing@domain",
    "  test@space.com  ",
    "no-at-sign.com",
    "@missingname.com",
]
bad_phones = [
    "+1 (555) 123-4567 ext 9",
    "phone: 12345",
    "N/A",
    "123-abc-4567",
    "555-!@#-1234",
    "Call 911",
]
bad_tax_numbers = ["TAX-123!45", "ID# 999-88", "123 456 789", "GST_@#_999"]


def maybe_bad(good_val, bad_list, chance=0.40):
    if random.random() < chance:
        return random.choice(bad_list)
    return good_val


def maybe_space(value, chance=0.35):
    if value and random.random() < chance:
        return f"   {value}  "
    return value


def generate():
    data = []
    party_numbers = []

    for i in range(1, NUM_RECORDS + 1):
        if i > 1 and random.random() < 0.15:
            party_numbers.append(party_numbers[-1])
        elif random.random() < 0.30:
            party_numbers.append(str(i))
        else:
            party_numbers.append(f"{i:08d}")

    for i, party_number in enumerate(party_numbers, start=1):
        name_prefix = random.choice(names_base)
        party_name = f"{name_prefix} {random.choice(company_types)}"
        if random.random() < 0.25:
            party_name += (
                " LONG NAME EXCEEDING THIRTY FIVE CHARACTERS "
                "SAP LIMIT WHICH SHOULD TRIGGER LENGTH VALIDATION ERROR"
            )
        party_name = maybe_space(party_name)
        if random.random() < 0.20:
            party_name = ""

        search_key = party_name.upper() if party_name else ""
        if search_key and random.random() < 0.20:
            search_key = search_key.lower()

        country = maybe_bad(random.choice(countries), bad_countries, 0.40)
        address_country = maybe_bad(random.choice(countries), bad_countries, 0.40)
        address_code = f"ADDR{party_number.zfill(8)}" if party_number.isdigit() else f"ADDR{i:08d}"
        if random.random() < 0.10:
            address_code = ""

        phone = maybe_bad(f"3{random.randint(100000000, 999999999)}", bad_phones)
        fax_number = maybe_bad(f"+57{random.randint(1000000000, 9999999999)}", bad_phones, 0.20)
        contact_phone = maybe_bad(f"3{random.randint(100000000, 999999999)}", bad_phones, 0.25)
        email = maybe_bad(f"contact@{name_prefix.replace(' ', '').lower()}.com", bad_emails)
        contact_email = maybe_bad(f"contact.person{i}@example.com", bad_emails, 0.30)

        language = random.choice(["EN", "ES", "DE", "FR", "en", "INVALID_LANG"])
        if random.random() < 0.10:
            language = ""

        postal_code = str(random.randint(10000, 99999))
        if random.random() < 0.20:
            postal_code *= 5

        customer_group = random.choice(["01", "02", "03", "RETAIL", "WHOLESALE"])
        if random.random() < 0.10:
            customer_group = "INVALID_GROUP"

        tax_number = maybe_bad(
            f"{random.randint(800000000, 999999999)}-{random.randint(1, 9)}",
            bad_tax_numbers,
        )
        currency = random.choice(["USD", "EUR", "GBP", "INR", "US Dollars", "Euro", "Indian Rupee"])
        payment_terms = random.choice(["NT30", "0001", "Z001"])
        if random.random() < 0.30:
            payment_terms = random.choice(["nt30", "0001", "z001"])
        if random.random() < 0.25:
            payment_terms = ""

        incoterms = random.choice(["FOB", "CIF"])
        if random.random() < 0.30:
            incoterms = incoterms.lower()
        price_group = "PRIC01"
        if random.random() < 0.30:
            price_group = price_group.lower()

        bill_to = party_number if random.random() >= 0.10 else ""
        ship_to = party_number if random.random() >= 0.10 else ""
        payer = party_number if random.random() >= 0.10 else ""

        values = [
            party_number,  # tccom100.bpid
            party_name,  # tccom100.nama
            search_key,  # tccom100.sort
            country,  # tccom100.ctry
            language,  # tccom100.lang
            phone,  # tccom100.telp
            fax_number,  # tccom100.faxn
            email,  # tccom100.email
            address_code,  # tccom130.cadr
            maybe_space(f"CR {random.randint(1, 100)} # {random.randint(1, 100)} - {random.randint(1, 100)}"),  # tccom130.add1
            random.choice(["", f"Suite {random.randint(1, 500)}", f"Floor {random.randint(1, 20)}"]),  # tccom130.add2
            random.choice(cities),  # tccom130.city
            random.choice(states),  # tccom130.stat
            postal_code,  # tccom130.pstc
            address_country,  # tccom130.ctry
            random.choice(["Maria Gomez", "John Smith", "Ana Rodriguez", "David Miller", "Priya Sharma", "Carlos Lopez"]),  # tccom140.cont
            contact_phone,  # tccom140.telp
            contact_email,  # tccom140.email
            party_number,  # tccom110.cuno
            party_name,  # tccom110.namn
            customer_group,  # tccom110.cgrp
            tax_number,  # tccom110.taxn
            currency,  # tccom110.curr
            bill_to,  # tccom112.billto
            ship_to,  # tccom111.shipto
            payer,  # tccom114.payer
            payment_terms,  # tccom110.pymt
            random.choice(["140000", "140100", "INVALID_ACCOUNT"]),  # tccom110.recon
            random.choice(["", "D001", "D002", "01"]),  # tccom110.dunn
            random.choice(["", "T", "C", "B", "BANK", "CHECK"]),  # tccom110.paym
            random.choice(["1000", "2000", "9999"]),  # tccom110.slso
            "10 " if random.random() < 0.30 else "10",  # tccom110.dist
            random.choice(["00", "XX"]),  # tccom110.divi
            incoterms,  # tccom110.inco
            price_group,  # tccom110.pric
            random.choice(["1", "2", "3", "INVALID"]),  # tccom110.custp
            random.choice(["01", "02", "03", "INVALID"]),  # tccom110.shipc
            random.choice(["1000", "2000", "3000", "INVALID"]),  # tccom110.salesoff
            random.choice(["001", "002", "003", "INVALID"]),  # tccom110.salesgrp
            random.choice(["", "01", "02", "Z1"]),  # tccom110.delblk
            random.choice(["", "01", "02", "Z1"]),  # tccom110.ordblk
            random.choice(["5000", "10000", "25000", "50000", "100000", "-5000"]),  # tccom110.credlim
            random.choice(["A", "B", "C", "D", "HIGH", "LOW", "INVALID"]),  # tccom110.riskcat
        ]
        data.append(values)

    # Include blank records as before to exercise empty-row handling.
    for _ in range(50):
        data.insert(random.randint(0, len(data) - 1), [""] * len(FIELD_PAIRS))

    final_data = [header_row_1, header_row_2] + data
    df = pd.DataFrame(final_data)
    public_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../public"))
    os.makedirs(public_dir, exist_ok=True)
    df.to_excel(os.path.join(public_dir, "Infor.xlsx"), index=False, header=False)


if __name__ == "__main__":
    generate()
    print("Successfully generated 1200 Infor records with 43 Infor LN fields and sample data issues in public/Infor.xlsx")
