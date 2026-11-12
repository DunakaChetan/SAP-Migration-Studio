// ═══════════════════════════════════════════════════════
// MIGRATION STORE — Global state (ported from S{})
// ═══════════════════════════════════════════════════════

import React, { createContext, useContext, useReducer, useEffect, type ReactNode } from 'react';

export interface MappingEntry {
  src: string;
  sap: string;
  sapLabel: string;
  conf: number;
  tr: string;
  note: string;
  req: boolean;
  srcType?: string;
  transform?: string;
}

export interface ValidationEntry {
  row: Record<string, unknown>;
  idx: number;
  primary_key?: string;
  errs: { f: string; m: string; sev: string; rule: string }[];
  warns: { f: string; m: string; sev: string; rule: string }[];
  st: 'ERROR' | 'WARN' | 'PASS';
}

export interface SourceInstance {
  id: string; // e.g. "src_oracle_ebs", "src_infor", "src_file_..."
  type: string; // 'SAP_ECC' | 'ORACLE_EBS' | 'INFOR' | 'EXCEL_CSV' | 'DYNAMICS' | 'SALESFORCE' | 'LEGACY'
  name: string; // Display name e.g. "Oracle EBS R12", "Infor CloudSuite", "Customers_East.csv"
  sub?: string;
  connection?: {
    baseUrl?: string;
    client?: string;
    username?: string;
    password?: string;
  };
  fileMeta?: {
    name: string;
    size: number;
    lastModified?: number;
    headers?: string[];
  };
  headers: string[]; // detected columns / fields
  rawData: Record<string, any>[]; // raw data records (sample or full)
  sampleRecords: Record<string, any>[]; // sample 10 extracted records
  connectionTested: boolean; // whether connection / file read has been tested
  sampleExtracted: boolean; // whether sample 10 records have been extracted
  mapping: MappingEntry[]; // field mappings for this source
  extractedRows?: Record<string, any>[]; // extracted records in target format
  extractedTables?: any[]; // target SAP structure tables for this source
  edaStats?: any[]; // data quality profile stats for this source
  reportMetrics?: any; // summary score, grade, metrics for this source
  complianceData?: any[]; // compliance audit checks for this source
  aiReport?: any; // AI Quality Intelligence report for this source
  isMappingComplete?: boolean;
  status?: 'configured' | 'tested' | 'extracted' | 'mapped';
}

export type MockCycle = 'mock-0' | 'mock-1' | 'mock-2';

export interface MigrationState {
  activeMock: MockCycle;
  projectId: string | null;
  projectName: string | null;
  connUrl: string;
  connClient: string;
  connUser: string;
  connPass: string;
  src: string;
  obj: string;
  selectedSources: SourceInstance[];
  activeSourceId: string | null;
  cc: string;
  so: string;
  po: string;
  plant: string;
  curr: string;
  distch: string;
  spart: string;
  rawData: Record<string, string>[];
  uploadedData: Record<string, any>[];
  headers: string[];
  mapping: MappingEntry[];
  extracted: Record<string, string>[];
  extractedTables: any[];
  harmonized: Record<string, string>[];
  validated: ValidationEntry[];
  cleaned: Record<string, string>[];
  transformed: Record<string, string>[];
  dmcRows: Record<string, string>[];
  aiLog: { ts: string; p: string; r: string }[];
  fixLog: string[];
  stats: { fixes: number; errors: number; warns: number; passed: number };
  theme: 'light' | 'dark';
  isMappingSaved: boolean;
  isDataSaved: boolean;
  aiReport: any;
  edaStats: any[];
  reportMetrics: any;
  complianceData: any[];
  isHarmonizedSaved: boolean;
  harmonizationResult: any;
  isValidatedSaved: boolean;
  validationReport: any[];
  dynamicRules: any[];
  isCleansedSaved: boolean;
  cleansingSummary: any;
  transformSummary: any;
  transformPipeline: any[];
  isTransformedSaved: boolean;
  isTechDocsSaved: boolean;
  techDocId: string | null;
  isMock1Completed: boolean;
  uploadedFilesMeta: { name: string; size: number; headersCount?: number }[];
  fileSchemas: { filename: string; headers: string[] }[];
  joinConfig: {
    base_file: string;
    joins: {
      join_file: string;
      source_file?: string;
      base_key?: string;
      join_key?: string;
      key_pairs?: { base_key: string; join_key: string }[];
    }[];
  };
}

export const isMock0Completed = (state: MigrationState): boolean => {
  if (!state.projectId) return false;
  // Strictly require Mock 0 to be completely finished including Step 9 Tech Docs
  return Boolean(state.isTechDocsSaved || state.techDocId);
};

export const isMock1Completed = (state: MigrationState): boolean => {
  return Boolean(isMock0Completed(state) && state.isMock1Completed);
};

const defaultState: MigrationState = {
  activeMock: 'mock-0',
  projectId: null,
  projectName: null,
  connUrl: '',
  connClient: '100',
  connUser: '',
  connPass: '',
  src: 'SAP_ECC',
  obj: 'CUSTOMER',
  selectedSources: [],
  activeSourceId: null,
  cc: '1000',
  so: '1000',
  po: '1000',
  plant: '1000',
  curr: 'USD',
  distch: '10',
  spart: '00',
  rawData: [],
  uploadedData: [],
  headers: [],
  mapping: [],
  extracted: [],
  extractedTables: [],
  harmonized: [],
  validated: [],
  cleaned: [],
  transformed: [],
  dmcRows: [],
  aiLog: [],
  fixLog: [],
  stats: { fixes: 0, errors: 0, warns: 0, passed: 0 },
  theme: 'light',
  isMappingSaved: false,
  isDataSaved: false,
  aiReport: null,
  edaStats: [],
  reportMetrics: null,
  complianceData: [],
  isHarmonizedSaved: false,
  harmonizationResult: null,
  isValidatedSaved: false,
  validationReport: [],
  dynamicRules: [],
  isCleansedSaved: false,
  cleansingSummary: null,
  transformSummary: null,
  transformPipeline: [],
  isTransformedSaved: false,
  isTechDocsSaved: false,
  techDocId: null,
  isMock1Completed: false,
  uploadedFilesMeta: [],
  fileSchemas: [],
  joinConfig: { base_file: '', joins: [] },
};

const getInitialState = (): MigrationState => {
  if (typeof window !== 'undefined') {
    try {
      const saved = sessionStorage.getItem('migration_state');
      if (saved) {
        return { ...defaultState, ...JSON.parse(saved) };
      }
    } catch (e) {
      console.warn('Failed to load state from session storage', e);
    }
  }
  return defaultState;
};

type Action =
  | { type: 'SET_FIELD'; field: keyof MigrationState; value: unknown }
  | { type: 'SET_THEME'; theme: 'light' | 'dark' }
  | { type: 'BATCH_UPDATE'; updates: Partial<MigrationState> }
  | { type: 'ADD_SOURCE'; source: SourceInstance }
  | { type: 'REMOVE_SOURCE'; sourceId: string }
  | { type: 'UPDATE_SOURCE'; sourceId: string; updates: Partial<SourceInstance> };

function reducer(state: MigrationState, action: Action): MigrationState {
  switch (action.type) {
    case 'SET_FIELD':
      return { ...state, [action.field]: action.value };
    case 'SET_THEME':
      localStorage.setItem('theme', action.theme);
      return { ...state, theme: action.theme };
    case 'BATCH_UPDATE':
      return { ...state, ...action.updates };
    case 'ADD_SOURCE': {
      const exists = (state.selectedSources || []).some(s => s.id === action.source.id);
      const updated = exists
        ? (state.selectedSources || []).map(s => s.id === action.source.id ? { ...s, ...action.source } : s)
        : [...(state.selectedSources || []), action.source];
      return {
        ...state,
        selectedSources: updated,
        activeSourceId: state.activeSourceId || action.source.id
      };
    }
    case 'REMOVE_SOURCE': {
      const updated = (state.selectedSources || []).filter(s => s.id !== action.sourceId);
      return {
        ...state,
        selectedSources: updated,
        activeSourceId: state.activeSourceId === action.sourceId ? (updated[0]?.id || null) : state.activeSourceId
      };
    }
    case 'UPDATE_SOURCE': {
      const updated = (state.selectedSources || []).map(s =>
        s.id === action.sourceId ? { ...s, ...action.updates } : s
      );
      return { ...state, selectedSources: updated };
    }
    default:
      return state;
  }
}

const MigrationContext = createContext<{
  state: MigrationState;
  dispatch: React.Dispatch<Action>;
} | null>(null);

export function MigrationProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, defaultState, getInitialState);

  useEffect(() => {
    try {
      sessionStorage.setItem('migration_state', JSON.stringify(state));
    } catch (e) {
      console.warn('Failed to save state to session storage. It might be too large.', e);
    }
  }, [state]);

  return (
    <MigrationContext.Provider value={{ state, dispatch }}>
      {children}
    </MigrationContext.Provider>
  );
}

export function useMigration() {
  const ctx = useContext(MigrationContext);
  if (!ctx) throw new Error('useMigration must be used within MigrationProvider');
  return ctx;
}
