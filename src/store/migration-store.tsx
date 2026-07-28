// ═══════════════════════════════════════════════════════
// MIGRATION STORE — Global state (ported from S{})
// ═══════════════════════════════════════════════════════

import React, { createContext, useContext, useReducer, type ReactNode } from 'react';

export interface MappingEntry {
  src: string;
  sap: string;
  sapLabel: string;
  conf: number;
  tr: string;
  note: string;
  req: boolean;
  srcType?: string;
}

export interface ValidationEntry {
  row: Record<string, unknown>;
  idx: number;
  errs: { f: string; m: string; sev: string }[];
  warns: { f: string; m: string; sev: string }[];
  st: 'ERROR' | 'WARN' | 'PASS';
}

export interface MigrationState {
  src: string;
  obj: string;
  cc: string;
  so: string;
  po: string;
  plant: string;
  curr: string;
  distch: string;
  spart: string;
  rawData: Record<string, string>[];
  headers: string[];
  mapping: MappingEntry[];
  extracted: Record<string, string>[];
  harmonized: Record<string, string>[];
  validated: ValidationEntry[];
  cleaned: Record<string, string>[];
  transformed: Record<string, string>[];
  dmcRows: Record<string, string>[];
  aiLog: { ts: string; p: string; r: string }[];
  fixLog: string[];
  stats: { fixes: number; errors: number; warns: number; passed: number };
  theme: 'light' | 'dark';
}

const initialState: MigrationState = {
  src: 'SAP_ECC',
  obj: 'CUSTOMER',
  cc: '1000',
  so: '1000',
  po: '1000',
  plant: '1000',
  curr: 'INR',
  distch: '10',
  spart: '00',
  rawData: [],
  headers: [],
  mapping: [],
  extracted: [],
  harmonized: [],
  validated: [],
  cleaned: [],
  transformed: [],
  dmcRows: [],
  aiLog: [],
  fixLog: [],
  stats: { fixes: 0, errors: 0, warns: 0, passed: 0 },
  theme: (typeof window !== 'undefined' && localStorage.getItem('theme') as 'light' | 'dark') || 'light',
};

type Action =
  | { type: 'SET_FIELD'; field: keyof MigrationState; value: unknown }
  | { type: 'SET_THEME'; theme: 'light' | 'dark' }
  | { type: 'BATCH_UPDATE'; updates: Partial<MigrationState> };

function reducer(state: MigrationState, action: Action): MigrationState {
  switch (action.type) {
    case 'SET_FIELD':
      return { ...state, [action.field]: action.value };
    case 'SET_THEME':
      localStorage.setItem('theme', action.theme);
      return { ...state, theme: action.theme };
    case 'BATCH_UPDATE':
      return { ...state, ...action.updates };
    default:
      return state;
  }
}

const MigrationContext = createContext<{
  state: MigrationState;
  dispatch: React.Dispatch<Action>;
} | null>(null);

export function MigrationProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
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
