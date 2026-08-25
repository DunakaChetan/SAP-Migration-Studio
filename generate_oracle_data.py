import pandas as pd
import random

NUM_RECORDS = 1200

# Original headers
header_row_1 = [
    'HZ_PARTIES', 'HZ_PARTIES', 'HZ_PARTIES', 'HZ_LOCATIONS', 'HZ_LOCATIONS', 
    'HZ_LOCATIONS', 'HZ_LOCATIONS', 'HZ_LOCATIONS', 'HZ_CUST_ACCOUNTS', 'AR_CUSTOMERS', 
    'AR_CUSTOMERS', 'HZ_CUST_SITE_USES_ALL', 'HZ_CUST_SITE_USES_ALL', 'HZ_CUST_SITE_USES_ALL', 
    'HZ_CUST_SITE_USES_ALL', 'HZ_CUST_SITE_USES_ALL', 'HZ_CUST_SITE_USES_ALL', 'HZ_PARTIES', 
    'HZ_CONTACT_POINTS', 'HZ_CONTACT_POINTS', 'IBY_EXT_BANK_ACCOUNTS', 'HZ_CUST_SITE_USES_ALL', 'HZ_PARTIES'
]

header_row_2 = [
    'PARTY_NAME', 'PARTY_NUMBER', 'PARTY_TYPE', 'ADDRESS1', 'CITY', 
    'STATE', 'POSTAL_CODE', 'COUNTRY', 'CUSTOMER_NUMBER', 'RECON_ACCOUNT', 
    'PAYMENT_TERM', 'SALES_ORG', 'DISTRIBUTION_CHANNEL', 'DIVISION', 
    'PRICE_LIST', 'CUSTOMER_GROUP', 'INCOTERMS', 'GST_NUMBER', 
    'EMAIL_ADDRESS', 'PHONE_NUMBER', 'BANK_ACCOUNT_NUM', 'SHIP_TO', 'CREATION_DATE'
]

# Base data pools to simulate real Oracle patterns
company_types = ["SAS", "LLC", "INC", "S.A.", "CORP"]
names_base = ["ADMINISTRADORA COUNTRY", "AM MEDICAL", "ANGIOGRAFIA DE COLOMBIA", "ANGIOGRAFIA DE OCCIDENTE", "TECH SOLUTIONS", "GLOBAL LOGISTICS", "MEDICAL DEVICES", "ORACLE CORP", "ACME CORP", "STARK IND"]
cities = ["Bogota", "Cali", "Medellin", "New York", "London", "Berlin"]
states = ["CUN", "VAC", "ANT", "NY", "LND", "BER"]
countries = ["CO", "US", "DE", "GB", "IN"]

bad_countries = ["Colombia", "United States", "Germany", "United Kingdom", "India"]
bad_emails = ["not_an_email", "admin@.com", "missing@domain", "  test@space.com  ", "no-at-sign.com", "@missingname.com"]
bad_phones = ["+1 (555) 123-4567 ext 9", "phone: 12345", "N/A", "123-abc-4567", "555-!@#-1234", "Call 911"]
bad_gst = ["TAX-123!45", "ID# 999-88", "123 456 789", "GST_@#_999"]
lower_codes = ["us10", "ag", "cif", "fob", "01", "prc01"]

def maybe_bad(good_val, bad_list, chance=0.40):
    if random.random() < chance:
        return random.choice(bad_list)
    return good_val

def maybe_space(val, chance=0.35):
    if random.random() < chance:
        return f"   {val}  "
    return val

def generate():
    data = []
    
    party_numbers = []
    for i in range(1, NUM_RECORDS + 1):
        # 15% chance of duplicate keys (Dedup rule)
        if i > 1 and random.random() < 0.15:
            party_numbers.append(party_numbers[-1]) 
        else:
            # 30% chance of unpadded numbers (Pad Numeric IDs rule)
            if random.random() < 0.30:
                party_numbers.append(str(i)) 
            else:
                party_numbers.append(f"{i:08d}")
                
    for i, p_num in enumerate(party_numbers):
        name_prefix = random.choice(names_base)
        c_type = random.choice(company_types)
        party_name = f"{name_prefix} {c_type}"
        
        # 25% Field Length violation (Max char enforcement)
        if random.random() < 0.25:
            party_name = party_name + " LONG NAME EXCEEDING THIRTY FIVE CHARACTERS SAP LIMIT WHICH SHOULD TRIGGER LENGTH VALIDATION ERROR"
            
        party_name = maybe_space(party_name)
        
        # 20% Required Fields violation (Empty string)
        if random.random() < 0.20:
            party_name = "" 
            
        party_type = "ORGANIZATION"
        if random.random() < 0.20:
            party_type = "organization" # Uppercase rule violation
        
        address1 = f"CR {random.randint(1,100)} # {random.randint(1,100)} - {random.randint(1,100)}"
        address1 = maybe_space(address1)
        
        city = random.choice(cities)
        state = random.choice(states)
        postal = str(random.randint(10000, 99999))
        
        # 20% Exceed length for postal code
        if random.random() < 0.20:
            postal = postal * 5 
            
        country = random.choice(countries)
        # 40% chance to use full country name instead of ISO
        country = maybe_bad(country, bad_countries, 0.40) 
        
        cust_number = p_num 
        
        recon = "140000"
        pay_term = random.choice(["NT30", "0001", "Z001"])
        
        # 30% chance of lowercase payment term (UPPERCASE codes rule)
        if random.random() < 0.30:
            pay_term = random.choice(["nt30", "0001", "z001"]) 
            
        # 25% Required field missing (Fill Empty Fields rule)
        if random.random() < 0.25:
            pay_term = "" 
            
        sales_org = random.choice(["1000", "2000"])
        dist_channel = "10"
        division = "00"
        price_list = "PRC01"
        cust_group = "01"
        incoterms = random.choice(["FOB", "CIF"])
        
        # 30% lowercase code violations across various fields
        if random.random() < 0.30:
            incoterms = incoterms.lower()
        if random.random() < 0.30:
            price_list = price_list.lower()
        if random.random() < 0.30:
            dist_channel = "10 " # Trailing space
        
        gst = f"{random.randint(800000000, 999999999)}-{random.randint(1,9)}"
        # 40% Clean Tax Numbers violation (special chars)
        gst = maybe_bad(gst, bad_gst, 0.40)
        
        email = f"contact@{name_prefix.replace(' ', '').lower()}.com"
        # 40% Email Format violation
        email = maybe_bad(email, bad_emails, 0.40)
        
        phone = f"3{random.randint(100000000, 999999999)}"
        # 40% Phone Cleanup violation (invalid chars)
        phone = maybe_bad(phone, bad_phones, 0.40)
        
        bank_acc = f"{random.randint(1000000000, 9999999999)}"
        ship_to = "AG"
        # 30% lowercase violation
        if random.random() < 0.30:
            ship_to = "ag" 
            
        creation_date = f"2023{random.randint(1,12):02d}{random.randint(1,28):02d}" # YYYYMMDD
        # 40% Date Format violation (e.g. DD/MM/YYYY or MM-DD-YYYY or missing)
        if random.random() < 0.40:
            creation_date = random.choice([
                f"{random.randint(1,28):02d}/{random.randint(1,12):02d}/2023",
                f"{random.randint(1,12):02d}-{random.randint(1,28):02d}-2023",
                "2023-12-31",
                ""
            ])

        row = [
            party_name, p_num, party_type, address1, city, state, postal, country, cust_number,
            recon, pay_term, sales_org, dist_channel, division, price_list, cust_group, incoterms,
            gst, email, phone, bank_acc, ship_to, creation_date
        ]
        
        data.append(row)

    # Inject completely empty rows (Empty Row Filter rule)
    # 50 completely empty rows
    for _ in range(50):
        empty_row = [""] * len(header_row_2)
        data.insert(random.randint(0, len(data)-1), empty_row)

    final_data = [header_row_1, header_row_2] + data
    
    df = pd.DataFrame(final_data)
    df.to_excel('public/Oracle.xlsx', index=False, header=False)

if __name__ == '__main__':
    generate()
    print("Successfully generated 1200+ Oracle records with HIGH ERROR RATES and overwritten public/Oracle.xlsx")
