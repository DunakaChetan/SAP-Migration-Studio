// ═══════════════════════════════════════════════════════
// SAP OBJECT SCHEMAS
// Ported from original sap-migration-studio-v3.html
// ═══════════════════════════════════════════════════════

export interface SAPField {
  n: string;
  l: string;
  t: string;
  len: number;
  req: boolean;
  key: boolean;
  s: string;
  d: string;
}

export interface SAPObject {
  label: string;
  icon: string;
  module: string;
  tcode: string;
  dmc: string;
  fields: SAPField[];
}

export const OBJS: Record<string, SAPObject> = {
  CUSTOMER: {
    label: 'Customer Master (XD01)',
    icon: 'users',
    module: 'SD/FI',
    tcode: 'XD01',
    dmc: '0BC_CUS_MAIN',
    fields: [
      { n: 'KUNNR', l: 'Customer Number', t: 'CHAR', len: 10, req: true, key: true, s: 'General', d: '10-digit numeric customer account' },
      { n: 'KTOKD', l: 'Account Group', t: 'CHAR', len: 4, req: true, key: false, s: 'General', d: 'KUNA=Domestic, EXPU=Export' },
      { n: 'NAME1', l: 'Name 1', t: 'CHAR', len: 35, req: true, key: false, s: 'General', d: 'Primary company name' },
      { n: 'NAME2', l: 'Name 2', t: 'CHAR', len: 35, req: false, key: false, s: 'General', d: 'Additional name line' },
      { n: 'LAND1', l: 'Country Key', t: 'CHAR', len: 3, req: true, key: false, s: 'Address', d: 'ISO country code e.g. IN, US' },
      { n: 'ORT01', l: 'City', t: 'CHAR', len: 35, req: false, key: false, s: 'Address', d: 'City name' },
      { n: 'PSTLZ', l: 'Postal Code', t: 'CHAR', len: 10, req: false, key: false, s: 'Address', d: 'ZIP or postal code' },
      { n: 'REGIO', l: 'Region', t: 'CHAR', len: 3, req: false, key: false, s: 'Address', d: 'State/Province code e.g. KA, MH' },
      { n: 'STRAS', l: 'Street', t: 'CHAR', len: 35, req: false, key: false, s: 'Address', d: 'Street address' },
      { n: 'TELF1', l: 'Telephone', t: 'CHAR', len: 16, req: false, key: false, s: 'Contact', d: 'Primary phone number' },
      { n: 'SMTP_ADDR', l: 'Email', t: 'CHAR', len: 241, req: false, key: false, s: 'Contact', d: 'Email address' },
      { n: 'BUKRS', l: 'Company Code', t: 'CHAR', len: 4, req: true, key: false, s: 'Org', d: 'Company code e.g. 1000' },
      { n: 'VKORG', l: 'Sales Org', t: 'CHAR', len: 4, req: true, key: false, s: 'Org', d: 'Sales organisation code' },
      { n: 'VTWEG', l: 'Dist. Channel', t: 'CHAR', len: 2, req: true, key: false, s: 'Org', d: '10=Retail 20=Wholesale' },
      { n: 'SPART', l: 'Division', t: 'CHAR', len: 2, req: true, key: false, s: 'Org', d: 'Product division 00=All' },
      { n: 'WAERS', l: 'Currency', t: 'CUKY', len: 5, req: false, key: false, s: 'Financial', d: 'Currency ISO code INR USD EUR' },
      { n: 'ZTERM', l: 'Payment Terms', t: 'CHAR', len: 4, req: false, key: false, s: 'Financial', d: 'NT30 NT45 NT60' },
      { n: 'STCD1', l: 'Tax Number 1', t: 'CHAR', len: 16, req: false, key: false, s: 'Tax', d: 'GST/PAN number' },
      { n: 'TAXKD', l: 'Tax Class.', t: 'CHAR', len: 1, req: false, key: false, s: 'Tax', d: '0=Exempt 1=Taxable' },
    ],
  },
  VENDOR: {
    label: 'Vendor Master (XK01)',
    icon: 'building',
    module: 'MM/FI',
    tcode: 'XK01',
    dmc: '0BC_SUP_MAIN',
    fields: [
      { n: 'LIFNR', l: 'Vendor Number', t: 'CHAR', len: 10, req: true, key: true, s: 'General', d: '10-digit vendor account' },
      { n: 'KTOKK', l: 'Account Group', t: 'CHAR', len: 4, req: true, key: false, s: 'General', d: 'LIEF=Domestic LIF1=Export' },
      { n: 'NAME1', l: 'Vendor Name', t: 'CHAR', len: 35, req: true, key: false, s: 'General', d: 'Vendor company name' },
      { n: 'LAND1', l: 'Country', t: 'CHAR', len: 3, req: true, key: false, s: 'Address', d: 'ISO country code' },
      { n: 'ORT01', l: 'City', t: 'CHAR', len: 35, req: false, key: false, s: 'Address', d: 'City name' },
      { n: 'PSTLZ', l: 'Postal Code', t: 'CHAR', len: 10, req: false, key: false, s: 'Address', d: 'Postal code' },
      { n: 'REGIO', l: 'Region', t: 'CHAR', len: 3, req: false, key: false, s: 'Address', d: 'State/Province' },
      { n: 'STRAS', l: 'Street', t: 'CHAR', len: 35, req: false, key: false, s: 'Address', d: 'Street address' },
      { n: 'TELF1', l: 'Telephone', t: 'CHAR', len: 16, req: false, key: false, s: 'Contact', d: 'Phone number' },
      { n: 'SMTP_ADDR', l: 'Email', t: 'CHAR', len: 241, req: false, key: false, s: 'Contact', d: 'Email address' },
      { n: 'BUKRS', l: 'Company Code', t: 'CHAR', len: 4, req: true, key: false, s: 'Org', d: 'Company code' },
      { n: 'EKORG', l: 'Purchasing Org', t: 'CHAR', len: 4, req: true, key: false, s: 'Org', d: 'Purchasing organisation' },
      { n: 'WAERS', l: 'Currency', t: 'CUKY', len: 5, req: false, key: false, s: 'Financial', d: 'Invoice currency' },
      { n: 'ZTERM', l: 'Payment Terms', t: 'CHAR', len: 4, req: false, key: false, s: 'Financial', d: 'Payment terms key' },
      { n: 'STCD1', l: 'Tax Number', t: 'CHAR', len: 16, req: false, key: false, s: 'Tax', d: 'GST/Tax number' },
      { n: 'BANKS', l: 'Bank Country', t: 'CHAR', len: 3, req: false, key: false, s: 'Banking', d: 'Bank country key' },
      { n: 'BANKN', l: 'Bank Account', t: 'CHAR', len: 18, req: false, key: false, s: 'Banking', d: 'Bank account number' },
    ],
  },
  MATERIAL: {
    label: 'Material Master (MM01)',
    icon: 'package',
    module: 'MM',
    tcode: 'MM01',
    dmc: '0BC_MAT_MAIN',
    fields: [
      { n: 'MATNR', l: 'Material Number', t: 'CHAR', len: 40, req: true, key: true, s: 'General', d: 'Unique material ID' },
      { n: 'MBRSH', l: 'Industry Sector', t: 'CHAR', len: 1, req: true, key: false, s: 'General', d: 'M=Mech E=Elec A=Food' },
      { n: 'MTART', l: 'Material Type', t: 'CHAR', len: 4, req: true, key: false, s: 'General', d: 'ROH FERT HALB HAWA DIEN' },
      { n: 'MAKTX', l: 'Description', t: 'CHAR', len: 40, req: true, key: false, s: 'General', d: 'Material description English' },
      { n: 'MEINS', l: 'Base UoM', t: 'UNIT', len: 3, req: true, key: false, s: 'General', d: 'EA KG LT MT PC' },
      { n: 'MATKL', l: 'Material Group', t: 'CHAR', len: 9, req: false, key: false, s: 'General', d: 'Material group code' },
      { n: 'WERKS', l: 'Plant', t: 'CHAR', len: 4, req: true, key: false, s: 'Plant', d: 'Plant code e.g. 1000' },
      { n: 'LGORT', l: 'Storage Loc.', t: 'CHAR', len: 4, req: false, key: false, s: 'Plant', d: 'Storage location 0001' },
      { n: 'BRGEW', l: 'Gross Weight', t: 'DEC', len: 15, req: false, key: false, s: 'Measures', d: 'Gross weight value' },
      { n: 'NTGEW', l: 'Net Weight', t: 'DEC', len: 15, req: false, key: false, s: 'Measures', d: 'Net weight value' },
      { n: 'GEWEI', l: 'Weight Unit', t: 'UNIT', len: 3, req: false, key: false, s: 'Measures', d: 'KG LB G' },
      { n: 'EKGRP', l: 'Purchasing Grp', t: 'CHAR', len: 3, req: false, key: false, s: 'Purchasing', d: 'Purchasing group' },
      { n: 'BKLAS', l: 'Valuation Class', t: 'CHAR', len: 4, req: false, key: false, s: 'Accounting', d: 'For FI posting e.g. 3000' },
    ],
  },
};

export const DMC_COLS: Record<string, string[]> = {
  CUSTOMER: ['KUNNR', 'KTOKD', 'NAME1', 'NAME2', 'LAND1', 'ORT01', 'PSTLZ', 'REGIO', 'STRAS', 'TELF1', 'SMTP_ADDR', 'BUKRS', 'VKORG', 'VTWEG', 'SPART', 'WAERS', 'ZTERM', 'STCD1', 'TAXKD'],
  VENDOR: ['LIFNR', 'KTOKK', 'NAME1', 'LAND1', 'ORT01', 'PSTLZ', 'REGIO', 'STRAS', 'TELF1', 'SMTP_ADDR', 'BUKRS', 'EKORG', 'WAERS', 'ZTERM', 'STCD1', 'BANKS', 'BANKN'],
  MATERIAL: ['MATNR', 'MBRSH', 'MTART', 'MAKTX', 'MEINS', 'MATKL', 'WERKS', 'LGORT', 'BRGEW', 'NTGEW', 'GEWEI', 'EKGRP', 'BKLAS'],
};
