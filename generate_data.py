import csv
import random
import datetime

NUM_RECORDS = 1200

# Lists of possible bad data to inject
bad_emails = ["not-an-email", "john@.com", "missing@domain", "   spaced@email.com  "]
bad_phones = ["+1 (555) 123-4567 ext 99", "phone: 123456", "N/A", "123-abc-4567"]
bad_countries = ["United States", "Germany", "United Kingdom", "  India  "]
bad_currencies = ["US Dollars", "Euro", "Yen", "Pounds"]
bad_dates = ["12/31/2023", "2023-12-31", "31-12-2023", "  20230101  "]
bad_tax_numbers = ["TAX-123!45", "ID# 999-88", "123 456 789"]

first_names = ["John", "Jane", "Alice", "Bob", "Charlie", "Diana", "Eve", "Frank"]
last_names = ["Smith", "Doe", "Johnson", "Williams", "Brown", "Jones", "Miller", "Davis"]
cities = ["New York", "London", "Berlin", "Paris", "Tokyo", "Sydney", "Mumbai", "Toronto"]
states = ["NY", "LND", "BER", "PAR", "TOK", "NSW", "MH", "ON"]

def maybe_bad(good_val, bad_list, chance=0.15):
    if random.random() < chance:
        return random.choice(bad_list)
    return good_val

def maybe_empty(val, chance=0.05):
    if random.random() < chance:
        return ""
    return val

def maybe_space(val, chance=0.1):
    if random.random() < chance:
        return f"   {val}  "
    return val

def generate():
    customers = []
    addresses = []
    company_codes = []
    customer_sales = []

    # Generate 1200 Customer IDs (intentionally creating a few duplicates for dedup rule)
    customer_ids = []
    for i in range(1, NUM_RECORDS + 1):
        # 2% chance of duplicate ID
        if i > 1 and random.random() < 0.02:
            customer_ids.append(customer_ids[-1])
        else:
            # 5% chance of unpadded ID (e.g. 15 instead of 0000000015)
            if random.random() < 0.05:
                customer_ids.append(str(i))
            else:
                customer_ids.append(f"{i:010d}") # Padded to 10 digits

    for i, cid in enumerate(customer_ids):
        # Customers.csv: CustomerID,FirstName,LastName,Email,Phone,TaxNumber,DateOfBirth
        fname = random.choice(first_names)
        lname = random.choice(last_names)
        email = f"{fname.lower()}.{lname.lower()}@example.com"
        email = maybe_bad(email, bad_emails)
        email = maybe_space(email)
        email = maybe_empty(email)
        
        phone = f"555{random.randint(1000000, 9999999)}"
        phone = maybe_bad(phone, bad_phones)
        
        tax = f"{random.randint(100000000, 999999999)}"
        tax = maybe_bad(tax, bad_tax_numbers)
        
        dob = (datetime.date(1980, 1, 1) + datetime.timedelta(days=random.randint(0, 10000))).strftime("%Y%m%d")
        dob = maybe_bad(dob, bad_dates)

        customers.append([cid, fname, lname, email, phone, tax, dob])

        # Addresses.csv: AddressID,CustID,Street,City,State,Zip,Country
        addr_id = f"A{i+1:05d}"
        street = f"{random.randint(100, 9999)} Main St"
        city = random.choice(cities)
        state = random.choice(states)
        zip_code = str(random.randint(10000, 99999))
        if random.random() < 0.05:
            zip_code = zip_code * 4 # Exceed field length rule
            
        country = random.choice(["US", "DE", "GB", "IN"])
        country = maybe_bad(country, bad_countries)
        
        addresses.append([addr_id, cid, street, city, state, zip_code, country])

        # CompanyCode.csv: Cust_ID,Company_Code,Reconciliation_Account,Payment_Terms,Currency,Credit_Limit
        # 10% chance of lowercase code for UPPERCASE rule
        co_code = random.choice(["1000", "2000", "3000"])
        if random.random() < 0.1:
            co_code = "us10"
            
        recon_acct = f"1400{random.randint(10, 99)}"
        pay_terms = random.choice(["NT30", "0001", "0002", "Z001"])
        pay_terms = maybe_empty(pay_terms, 0.1) # Missing Payment Terms
        
        currency = random.choice(["USD", "EUR", "GBP"])
        currency = maybe_bad(currency, bad_currencies)
        
        credit = str(random.randint(1000, 100000))
        company_codes.append([cid, co_code, recon_acct, pay_terms, currency, credit])

        # CustomerSales.csv: CustID,CoCode,Sales_Org,Dist_Channel,Division,Price_Group,Incoterms
        sales_org = co_code
        dist_channel = random.choice(["10", "20", "30"])
        division = random.choice(["00", "01"])
        price_group = random.choice(["01", "02"])
        incoterms = random.choice(["FOB", "CIF", "DDP", "EXW", "FCA"])
        
        customer_sales.append([cid, co_code, sales_org, dist_channel, division, price_group, incoterms])

    # Inject completely empty rows at random positions
    for _ in range(10):
        customers.insert(random.randint(0, len(customers)-1), ["", "", "", "", "", "", ""])
        addresses.insert(random.randint(0, len(addresses)-1), ["", "", "", "", "", "", ""])
        company_codes.insert(random.randint(0, len(company_codes)-1), ["", "", "", "", "", ""])
        customer_sales.insert(random.randint(0, len(customer_sales)-1), ["", "", "", "", "", "", ""])

    # Write to files
    with open('Customers.csv', 'w', newline='', encoding='utf-8') as f:
        writer = csv.writer(f)
        writer.writerow(['CustomerID', 'FirstName', 'LastName', 'Email', 'Phone', 'TaxNumber', 'DateOfBirth'])
        writer.writerows(customers)
        
    with open('Addresses.csv', 'w', newline='', encoding='utf-8') as f:
        writer = csv.writer(f)
        writer.writerow(['AddressID', 'CustID', 'Street', 'City', 'State', 'Zip', 'Country'])
        writer.writerows(addresses)
        
    with open('CompanyCode.csv', 'w', newline='', encoding='utf-8') as f:
        writer = csv.writer(f)
        writer.writerow(['Cust_ID', 'Company_Code', 'Reconciliation_Account', 'Payment_Terms', 'Currency', 'Credit_Limit'])
        writer.writerows(company_codes)
        
    with open('CustomerSales.csv', 'w', newline='', encoding='utf-8') as f:
        writer = csv.writer(f)
        writer.writerow(['CustID', 'CoCode', 'Sales_Org', 'Dist_Channel', 'Division', 'Price_Group', 'Incoterms'])
        writer.writerows(customer_sales)

if __name__ == '__main__':
    generate()
    print("Successfully generated 1200+ records across all files.")
