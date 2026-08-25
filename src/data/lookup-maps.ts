// ═══════════════════════════════════════════════════════
// LOOK-UP DICTIONARIES & TRANSFORMS
// Ported from original sap-migration-studio-v3.html
// ═══════════════════════════════════════════════════════

export const COUNTRY_MAP: Record<string, string> = {
  'INDIA':'IN','UNITED STATES':'US','USA':'US','UNITED KINGDOM':'GB','UK':'GB',
  'GERMANY':'DE','FRANCE':'FR','AUSTRALIA':'AU','CANADA':'CA','JAPAN':'JP',
  'CHINA':'CN','SINGAPORE':'SG','UAE':'AE','UNITED ARAB EMIRATES':'AE',
  'NETHERLANDS':'NL','SWEDEN':'SE','SWITZERLAND':'CH','ITALY':'IT',
  'SPAIN':'ES','BRAZIL':'BR','SOUTH KOREA':'KR',
};

export const CURR_MAP: Record<string, string> = {
  'USD': 'USD', 'US DOLLAR': 'USD', 'US DOLLARS': 'USD', 'DOLLAR': 'USD', 'DOLLARS': 'USD',
  'UNITED STATES DOLLAR': 'USD', 'UNITED STATES DOLLARS': 'USD', 'AMERICAN DOLLAR': 'USD', 'AMERICAN DOLLARS': 'USD',
  'US$': 'USD', '$': 'USD', 'U.S. DOLLAR': 'USD', 'U.S. DOLLARS': 'USD',
  'GBP': 'GBP', 'POUND': 'GBP', 'POUNDS': 'GBP', 'STERLING': 'GBP', 'POUND STERLING': 'GBP', 'POUNDS STERLING': 'GBP',
  'BRITISH POUND': 'GBP', 'BRITISH POUNDS': 'GBP', 'GREAT BRITAIN POUND': 'GBP', 'GREAT BRITAIN POUNDS': 'GBP',
  'UK POUND': 'GBP', 'UK POUNDS': 'GBP', '£': 'GBP', 'GB£': 'GBP',
  'EUR': 'EUR', 'EURO': 'EUR', 'EUROS': 'EUR', '€': 'EUR',
  'INR': 'INR', 'INDIAN RUPEE': 'INR', 'INDIAN RUPEES': 'INR', 'RUPEE': 'INR', 'RUPEES': 'INR',
  'RS': 'INR', 'RS.': 'INR', '₹': 'INR',
  'JPY': 'JPY', 'YEN': 'JPY', 'JAPANESE YEN': 'JPY', '¥': 'JPY',
  'CNY': 'CNY', 'YUAN': 'CNY', 'CHINESE YUAN': 'CNY', 'RENMINBI': 'CNY', 'CHINESE RENMINBI': 'CNY', 'RMB': 'CNY',
  'CAD': 'CAD', 'CANADIAN DOLLAR': 'CAD', 'CANADIAN DOLLARS': 'CAD', 'C$': 'CAD',
  'AUD': 'AUD', 'AUS DOLLAR': 'AUD', 'AUS DOLLARS': 'AUD', 'AUSTRALIAN DOLLAR': 'AUD', 'AUSTRALIAN DOLLARS': 'AUD', 'A$': 'AUD',
  'CHF': 'CHF', 'SWISS FRANC': 'CHF', 'SWISS FRANCS': 'CHF', 'FRANC': 'CHF', 'FRANCS': 'CHF',
  'AED': 'AED', 'DIRHAM': 'AED', 'DIRHAMS': 'AED', 'UAE DIRHAM': 'AED', 'UAE DIRHAMS': 'AED',
  'SAR': 'SAR', 'RIYAL': 'SAR', 'RIYALS': 'SAR', 'SAUDI RIYAL': 'SAR',
  'QAR': 'QAR', 'QATARI RIYAL': 'QAR', 'SGD': 'SGD', 'SINGAPORE DOLLAR': 'SGD', 'SINGAPORE DOLLARS': 'SGD',
  'HKD': 'HKD', 'HONG KONG DOLLAR': 'HKD', 'HKD$': 'HKD', 'NZD': 'NZD', 'NEW ZEALAND DOLLAR': 'NZD',
  'MXN': 'MXN', 'MEXICAN PESO': 'MXN', 'MEXICAN PESOS': 'MXN', 'PESO': 'MXN', 'PESOS': 'MXN',
  'BRL': 'BRL', 'BRAZILIAN REAL': 'BRL', 'REAL': 'BRL', 'REAIS': 'BRL',
  'ZAR': 'ZAR', 'SOUTH AFRICAN RAND': 'ZAR', 'RAND': 'ZAR',
  'SEK': 'SEK', 'SWEDISH KRONA': 'SEK', 'NOK': 'NOK', 'NORWEGIAN KRONE': 'NOK',
  'DKK': 'DKK', 'DANISH KRONE': 'DKK', 'PLN': 'PLN', 'POLISH ZLOTY': 'PLN',
  'TRY': 'TRY', 'TURKISH LIRA': 'TRY', 'RUB': 'RUB', 'RUSSIAN RUBLE': 'RUB', 'RUBLES': 'RUB',
  'KRW': 'KRW', 'SOUTH KOREAN WON': 'KRW', 'WON': 'KRW', 'THB': 'THB', 'THAI BAHT': 'THB',
  'MYR': 'MYR', 'MALAYSIAN RINGGIT': 'MYR', 'IDR': 'IDR', 'INDONESIAN RUPIAH': 'IDR',
  'PHP': 'PHP', 'PHILIPPINE PESO': 'PHP', 'VND': 'VND', 'VIETNAMESE DONG': 'VND',
  'EGP': 'EGP', 'EGYPTIAN POUND': 'EGP', 'ILS': 'ILS', 'ISRAELI SHEKEL': 'ILS',
  'CLP': 'CLP', 'COP': 'COP', 'ARS': 'ARS', 'TWD': 'TWD',
};

export const ZTERM_MAP: Record<string, string> = {
  'NET30':'NT30','NET 30':'NT30','30 DAYS':'NT30','30DAYS':'NT30',
  'NET45':'NT45','NET 45':'NT45','45 DAYS':'NT45',
  'NET60':'NT60','NET 60':'NT60','60 DAYS':'NT60',
  'NET15':'NT15','NET7':'NT07','IMMEDIATE':'NT00','CASH':'NT00',
  'COD':'NT00','DUE ON RECEIPT':'NT00','2/10 NET30':'2001',
};

export const MTART_MAP: Record<string, string> = {
  'RAW MATERIAL':'ROH','RAW':'ROH','RM':'ROH',
  'SEMI-FINISHED':'HALB','SEMI FINISHED':'HALB','WIP':'HALB',
  'FINISHED GOODS':'FERT','FINISHED':'FERT','FG':'FERT',
  'TRADING GOODS':'HAWA','TRADING':'HAWA',
  'SERVICE':'DIEN','OPERATING SUPPLIES':'HIBE','CONSUMABLE':'HIBE','HIBE':'HIBE',
};

export interface TransformDef {
  label: string;
  fn: (v: unknown) => string;
}

export const TRANSFORMS: Record<string, TransformDef> = {
  none: { label: 'None', fn: (v) => String(v) },
  trim: { label: 'Trim', fn: (v) => String(v).trim() },
  upper: { label: 'UPPER', fn: (v) => String(v).toUpperCase() },
  pad10: { label: 'Pad→10 digits', fn: (v) => String(v).replace(/\D/g, '').padStart(10, '0') },
  country: {
    label: 'Country→ISO',
    fn: (v) => COUNTRY_MAP[String(v).trim().toUpperCase()] || String(v).slice(0, 3).toUpperCase(),
  },
  currency: {
    label: 'Currency→ISO',
    fn: (v) => {
      const s = String(v).trim().toUpperCase();
      if (!s || s === 'NAN' || s === 'NULL' || s === 'NONE') return '';
      if (CURR_MAP[s]) return CURR_MAP[s];
      const clean = s.replace(/[^A-Z$€£¥₹₽₩฿₫₪]/g, '');
      if (CURR_MAP[clean]) return CURR_MAP[clean];
      if (clean.endsWith('S') && CURR_MAP[clean.slice(0, -1)]) return CURR_MAP[clean.slice(0, -1)];
      return s.slice(0, 5);
    },
  },
  payterm: {
    label: 'PayTerms→SAP',
    fn: (v) => ZTERM_MAP[String(v).trim().toUpperCase()] || String(v).toUpperCase(),
  },
  mattype: {
    label: 'MatType→SAP',
    fn: (v) => MTART_MAP[String(v).trim().toUpperCase()] || String(v).slice(0, 4).toUpperCase(),
  },
  date8: {
    label: 'Date→YYYYMMDD',
    fn: (v) => {
      const s = String(v);
      let m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
      if (m) return `${m[3]}${m[2].padStart(2, '0')}${m[1].padStart(2, '0')}`;
      m = s.match(/^(\d{4})[/-](\d{2})[/-](\d{2})$/);
      if (m) return `${m[1]}${m[2]}${m[3]}`;
      return s.replace(/\D/g, '').slice(0, 8);
    },
  },
  phone: { label: 'Phone clean', fn: (v) => String(v).replace(/[^\d+\-\s()]/g, '').trim() },
  trunc35: { label: 'Truncate 35', fn: (v) => String(v).slice(0, 35) },
};
