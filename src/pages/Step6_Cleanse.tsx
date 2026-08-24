import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { jsPDF } from 'jspdf';
import { useMigration } from '@/store/migration-store';
import { useToast } from '@/components/ui/toast';
import { useLoading } from '@/components/ui/loading-overlay';
import { dl, expCSV } from '@/lib/utils';
import {
  PageLayout, PageGrid, GridCol, Card, CardHeader, CardBody, Button,
  StatBox, StatsGrid, DataTable, InfoBox, EmptyState, PageHeader
} from '@/components/shared';
import {
  ArrowLeft, ArrowRight, Sparkles, Download, Bot, Upload, Save,
  ChevronDown, ChevronUp, Check, X, Trash2, Plus, RefreshCw, ListFilter,
  Search, FileText, Sliders, FileJson, ChevronLeft, ChevronRight, RotateCcw, Pencil
} from 'lucide-react';
import { TableFilterToolbar, filterRowsByKey, detectKeyColumns, getTableDisplayData } from '@/components/shared/TableFilterToolbar';
import type { TableInfo } from '@/components/shared/TableFilterToolbar';

/* ─── Types & Interfaces ─── */
type Source = 'harmonized' | 'upload';

interface FixItem {
  rule_code: string;
  row: number;
  field: string;
  old: string;
  new: string;
}

interface FixGroup {
  rule_code: string;
  field: string;
  count: number;
  items: FixItem[];
}

interface StandardRuleState {
  code: string;
  name: string;
  description: string;
  enabled: boolean;
  overridden?: boolean;
}

interface DynamicRuleItem {
  id: string;
  prompt: string;
  enabled: boolean;
}

interface ValidationRuleItem {
  rule_code: string;
  field: string;
  message: string;
  count: number;
  enabled: boolean;
}

interface AuditLogEntry {
  id: string;
  timestamp: string;
  phase: string;
  rule_code: string;
  row: number;
  field: string;
  old_value: string;
  new_value: string;
  status: string;
}

interface WarningItem {
  rule_code: string;
  row: number;
  field: string;
  reason: string;
  message: string;
}

interface CleanserSummary {
  overall_status?: string;
  rows_loaded?: number;
  rows_exported?: number;
  rows_modified_count?: number;
  rows_modified?: number[];
  dynamic_fixes?: { count?: number; items?: FixItem[] };
  validation_fixes?: { total?: number; count?: number; items?: FixItem[] };
  cleanser_fixes?: { total?: number; count?: number; items?: FixItem[] };
  manual_fixes?: { count?: number; items?: FixItem[] };
  priority_overrides?: {
    dynamic_overrides_standard_validation?: string[];
    dynamic_suppressed_cleanser?: string[];
    standard_rules_skipped?: string[];
    satisfied_dynamic_rules?: string[];
  };
  warnings?: any;
  failures?: { count?: number; items?: any[] };
  rules_applied?: string[];
}

/* ─── Default Configurations ─── */
const DEFAULT_CLEANSER_DYNAMIC_RULES: DynamicRuleItem[] = [];

const DEFAULT_STANDARD_RULES: StandardRuleState[] = [
  { code: 'CL_TRIM_WHITESPACE', name: 'Trim Whitespace', description: 'Leading/trailing spaces', enabled: true },
  { code: 'CL_COUNTRY_TO_ISO', name: 'Country→ISO', description: 'Full names to 2-3 char', enabled: true },
  { code: 'CL_CURRENCY_TO_ISO', name: 'Currency→ISO', description: 'Map to ISO 4217', enabled: true },
  { code: 'CL_PAD_NUMERIC_IDENTIFIER', name: 'Pad Numeric IDs', description: 'KUNNR/LIFNR 10 digits', enabled: true },
  { code: 'CL_UPPERCASE_CODE_FIELDS', name: 'UPPERCASE Codes', description: 'Org & code fields', enabled: true },
  { code: 'CL_CLEAN_TAX_NUMBER', name: 'Clean Tax Numbers', description: 'Remove special chars', enabled: true },
  { code: 'CL_FILL_EMPTY_FIELDS', name: 'Fill Empty Fields', description: 'Set null to blank', enabled: true },
];

/* ─── Helper Functions ─── */
function groupFixItems(items: FixItem[] = []): FixGroup[] {
  const map = new Map<string, FixGroup>();
  items.forEach((item) => {
    const key = `${item.rule_code || 'RULE'}::${item.field || 'FIELD'}`;
    if (!map.has(key)) {
      map.set(key, {
        rule_code: item.rule_code || 'CUSTOM_RULE',
        field: item.field || '',
        count: 0,
        items: []
      });
    }
    const g = map.get(key)!;
    g.count += 1;
    g.items.push(item);
  });
  return Array.from(map.values());
}

function exportAuditLogCSV(summary: CleanserSummary, projectName: string, targetObject: string): string {
  const timestamp = new Date().toISOString();
  const lines = [
    `# SAP Migration Studio — Detailed Cleansing Audit Log`,
    `# Project Name: "${projectName}"`,
    `# Target Object: "${targetObject}"`,
    `# Exported At: "${timestamp}"`,
    `# Overall Status: "${summary.overall_status || 'SUCCESS'}"`,
    `# Total Rows Modified: ${summary.rows_modified_count ?? 0}`,
    `#`,
    `Timestamp,Project Name,Target Object,Phase,Rule Code,Row Number,Field Name,Original Value,Cleansed Value,Status`
  ];

  const appendFixes = (phase: string, items?: FixItem[]) => {
    (items || []).forEach((item) => {
      const oldVal = String(item.old ?? '').replace(/"/g, '""');
      const newVal = String(item.new ?? '').replace(/"/g, '""');
      lines.push(`"${timestamp}","${projectName}","${targetObject}","${phase}","${item.rule_code || 'RULE'}",${item.row},"${item.field}","${oldVal}","${newVal}","APPLIED"`);
    });
  };

  appendFixes('Dynamic AI Rule', summary.dynamic_fixes?.items);
  appendFixes('Validation Fix', summary.validation_fixes?.items);
  appendFixes('Cleanser Normalization', summary.cleanser_fixes?.items);
  appendFixes('Manual Fix', summary.manual_fixes?.items);
  return lines.join('\n');
}

function exportExecutiveSummaryJSON(summary: CleanserSummary, projectName: string, targetObject: string): string {
  const payload = {
    metadata: {
      studio: "SAP Migration Studio",
      project_name: projectName,
      target_object: targetObject,
      generated_at: new Date().toISOString(),
      overall_status: summary.overall_status || 'SUCCESS',
    },
    metrics: {
      rows_loaded: summary.rows_loaded ?? 0,
      rows_modified_count: summary.rows_modified_count ?? 0,
      dynamic_fixes_count: summary.dynamic_fixes?.count ?? summary.dynamic_fixes?.items?.length ?? 0,
      validation_fixes_count: summary.validation_fixes?.count ?? summary.validation_fixes?.items?.length ?? 0,
      cleanser_fixes_count: summary.cleanser_fixes?.count ?? summary.cleanser_fixes?.items?.length ?? 0,
    },
    priority_overrides: summary.priority_overrides || {},
    warnings: summary.warnings || [],
    transformations: {
      dynamic_ai_fixes: summary.dynamic_fixes?.items || [],
      validation_fixes: summary.validation_fixes?.items || [],
      cleanser_normalizations: summary.cleanser_fixes?.items || [],
      manual_fixes: summary.manual_fixes?.items || [],
    }
  };
  return JSON.stringify(payload, null, 2);
}

/* ─── Main Step 6 Component ─── */
export function Step6Cleanse() {
  const { state, dispatch } = useMigration();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { showLoad, tick, hideLoad } = useLoading();

  const [source, setSource] = useState<Source>('harmonized');
  const [standaloneCsv, setStandaloneCsv] = useState<File | null>(null);
  const [standaloneValidationCsv, setStandaloneValidationCsv] = useState<File | null>(null);

  // Rule States
  const [standardRules, setStandardRules] = useState<StandardRuleState[]>(DEFAULT_STANDARD_RULES);
  const [cleanserDynamicRules, setCleanserDynamicRules] = useState<DynamicRuleItem[]>(DEFAULT_CLEANSER_DYNAMIC_RULES);
  const [validationRules, setValidationRules] = useState<ValidationRuleItem[]>([]);
  const [loadingValRules, setLoadingValRules] = useState(false);
  const [valRulesLoaded, setValRulesLoaded] = useState(false);

  // Active Tab for Rule Engine
  const [activeRuleTab, setActiveRuleTab] = useState<'standard' | 'validation' | 'dynamic'>('standard');
  const [ruleSearchQuery, setRuleSearchQuery] = useState('');

  // Editing state for standard rules
  const [editingRuleCode, setEditingRuleCode] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{ name: string; description: string }>({ name: '', description: '' });

  // Dynamic Rule edit state
  const [newDynamicPrompt, setNewDynamicPrompt] = useState('');
  const [editingDynamicId, setEditingDynamicId] = useState<string | null>(null);
  const [editDynamicPromptText, setEditDynamicPromptText] = useState('');

  // Audit Log UI state (Audit Log collapsed by default)
  const [openSummaryAccordion, setOpenSummaryAccordion] = useState(true);
  const [openAuditAccordion, setOpenAuditAccordion] = useState(false);
  const [openPreviewAccordion, setOpenPreviewAccordion] = useState(true);
  const [auditSearch, setAuditSearch] = useState('');
  const [auditPhaseFilter, setAuditPhaseFilter] = useState<string>('ALL');
  const [auditPage, setAuditPage] = useState(1);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

  // Batch Manual Fix Modal state
  const [showFixModal, setShowFixModal] = useState(false);
  const [manualFixValues, setManualFixValues] = useState<Record<string, string>>({});

  // Table filter state for cleansed output
  const extractedTables = state.extractedTables || [];
  const [selectedCleanseTables, setSelectedCleanseTables] = useState<Set<string>>(new Set());
  const [cleanseKeyFilter, setCleanseKeyFilter] = useState('');

  useEffect(() => {
    if (extractedTables.length > 0) {
      setSelectedCleanseTables(new Set(extractedTables.map((t: any) => t.table_name)));
    }
  }, [extractedTables.length]);

  const csvInputRef = useRef<HTMLInputElement>(null);
  const valCsvInputRef = useRef<HTMLInputElement>(null);
  const autoFetchedRef = useRef(false);

  const summary = (state.cleansingSummary || null) as CleanserSummary | null;
  const cleanedRows = state.cleaned || [];
  const has = cleanedRows.length > 0;

  // Auto-fetch Step 5 validation rules on mount (guarded against infinite re-render loops)
  useEffect(() => {
    if (state.projectId && state.obj && !valRulesLoaded && !loadingValRules && !autoFetchedRef.current) {
      autoFetchedRef.current = true;
      fetchValidationRules();
    }
  }, [state.projectId, state.obj]);

  const fetchValidationRules = async () => {
    if (!state.projectId || !state.obj) return;
    setLoadingValRules(true);
    try {
      const backendUrl = import.meta.env.VITE_BACKEND_URL || '';
      const res = await fetch(`${backendUrl}/api/sap/cleanser/validation-rules?project_id=${state.projectId}&target_object=${state.obj}`);
      if (!res.ok) throw new Error('Validation rules request returned error status');
      const data = await res.json();
      if (data && Array.isArray(data.rules)) {
        setValidationRules(data.rules.map((r: any) => ({ ...r, enabled: true })));
        setValRulesLoaded(true);
      }
    } catch (err: any) {
      console.warn('Auto-load validation rules notice:', err?.message || err);
    } finally {
      setLoadingValRules(false);
    }
  };

  useEffect(() => {
    if (state.projectId && state.obj) {
      const fetchSavedRules = async () => {
        try {
          const res = await fetch(`${import.meta.env.VITE_BACKEND_URL || ''}/api/validate/rules?project_id=${state.projectId}&target_object=${state.obj}&source=cleanse`);
          if (res.ok) {
            const data = await res.json();
            if (data.rules && data.rules.length > 0) {
              const rules = data.rules.map((r: any) => ({
                id: r.id,
                prompt: r.prompt || r.description || r.label || '',
                enabled: true
              }));
              setCleanserDynamicRules(rules);
            }
          }
        } catch (e) {
          console.error("Failed to fetch saved rules", e);
        }
      };
      fetchSavedRules();
    }
  }, [state.projectId, state.obj]);

  // Rule Handlers
  const toggleStandardRule = (code: string) => {
    setStandardRules(prev => prev.map(r => r.code === code ? { ...r, enabled: !r.enabled } : r));
  };

  const startEditStandardRule = (rule: StandardRuleState) => {
    setEditingRuleCode(rule.code);
    setEditForm({ name: rule.name, description: rule.description });
  };

  const saveEditStandardRule = (code: string) => {
    if (!editForm.name.trim()) return;
    const promptText = `${editForm.name.trim()}: ${editForm.description.trim()}`.trim();
    const dynamicId = `OVERRIDE_${code}`;

    // 1. Add/Update as a Dynamic AI Prompt Rule
    setCleanserDynamicRules(prev => {
      const exists = prev.some(r => r.id === dynamicId);
      if (exists) {
        return prev.map(r => r.id === dynamicId ? { ...r, prompt: promptText, enabled: true } : r);
      }
      return [...prev, { id: dynamicId, prompt: promptText, enabled: true }];
    });

    // 2. Mark original Standard Rule as disabled & overridden
    setStandardRules(prev => prev.map(r => r.code === code ? {
      ...r,
      name: editForm.name.trim(),
      description: editForm.description.trim(),
      enabled: false,
      overridden: true
    } : r));

    setEditingRuleCode(null);
    toast(`Rule "${editForm.name}" converted to Dynamic AI Rule (Standard rule overridden)`, 'ok');
  };

  const restoreStandardRule = (code: string) => {
    const dynamicId = `OVERRIDE_${code}`;
    setCleanserDynamicRules(prev => prev.filter(r => r.id !== dynamicId));
    setStandardRules(prev => prev.map(r => r.code === code ? { ...r, enabled: true, overridden: false } : r));
    toast('Restored standard rule execution', 'ok');
  };

  const toggleValidationRule = (ruleCode: string) => {
    setValidationRules(prev => prev.map(r => r.rule_code === ruleCode ? { ...r, enabled: !r.enabled } : r));
  };

  const addCleanserDynamicRule = () => {
    if (!newDynamicPrompt.trim()) return;
    const newRule: DynamicRuleItem = {
      id: `DYN_${Date.now()}`,
      prompt: newDynamicPrompt.trim(),
      enabled: true,
    };
    setCleanserDynamicRules(prev => [...prev, newRule]);
    setNewDynamicPrompt('');
  };

  const toggleCleanserDynamicRule = (id: string) => {
    setCleanserDynamicRules(prev => prev.map(r => r.id === id ? { ...r, enabled: !r.enabled } : r));
  };

  const deleteCleanserDynamicRule = (id: string) => {
    if (id.startsWith('OVERRIDE_')) {
      const origCode = id.replace('OVERRIDE_', '');
      setStandardRules(prev => prev.map(r => r.code === origCode ? { ...r, enabled: true, overridden: false } : r));
    }
    setCleanserDynamicRules(prev => prev.filter(r => r.id !== id));
  };

  const startEditDynamicRule = (rule: DynamicRuleItem) => {
    setEditingDynamicId(rule.id);
    setEditDynamicPromptText(rule.prompt);
  };

  const saveEditDynamicRule = (id: string) => {
    if (!editDynamicPromptText.trim()) return;
    setCleanserDynamicRules(prev => prev.map(r => r.id === id ? { ...r, prompt: editDynamicPromptText.trim() } : r));
    setEditingDynamicId(null);
  };

  const toggleGroup = (key: string) => setExpandedGroups(prev => ({ ...prev, [key]: !prev[key] }));

  // Audit Log computations
  const allAuditItems: AuditLogEntry[] = useMemo(() => {
    if (!summary) return [];
    const list: AuditLogEntry[] = [];
    const now = new Date().toLocaleTimeString();

    (summary.dynamic_fixes?.items || []).forEach((item, i) => {
      list.push({
        id: `dyn_${i}`,
        timestamp: now,
        phase: 'Dynamic AI Rule',
        rule_code: item.rule_code || 'DYNAMIC_RULE',
        row: item.row,
        field: item.field,
        old_value: String(item.old ?? ''),
        new_value: String(item.new ?? ''),
        status: 'APPLIED'
      });
    });

    (summary.validation_fixes?.items || []).forEach((item, i) => {
      list.push({
        id: `val_${i}`,
        timestamp: now,
        phase: 'Validation Fix',
        rule_code: item.rule_code || 'VALIDATION_FIX',
        row: item.row,
        field: item.field,
        old_value: String(item.old ?? ''),
        new_value: String(item.new ?? ''),
        status: 'APPLIED'
      });
    });

    (summary.cleanser_fixes?.items || []).forEach((item, i) => {
      list.push({
        id: `cls_${i}`,
        timestamp: now,
        phase: 'Cleanser Normalization',
        rule_code: item.rule_code || 'CLEANSER_RULE',
        row: item.row,
        field: item.field,
        old_value: String(item.old ?? ''),
        new_value: String(item.new ?? ''),
        status: 'APPLIED'
      });
    });

    (summary.manual_fixes?.items || []).forEach((item, i) => {
      list.push({
        id: `man_${i}`,
        timestamp: now,
        phase: 'Manual Fix',
        rule_code: item.rule_code || 'MANUAL_OVERRIDE',
        row: item.row,
        field: item.field,
        old_value: String(item.old ?? ''),
        new_value: String(item.new ?? ''),
        status: 'APPLIED'
      });
    });

    return list;
  }, [summary]);

  const filteredAuditItems = useMemo(() => {
    return allAuditItems.filter((item) => {
      const matchPhase =
        auditPhaseFilter === 'ALL' ||
        (auditPhaseFilter === 'DYNAMIC' && item.phase === 'Dynamic AI Rule') ||
        (auditPhaseFilter === 'VALIDATION' && item.phase === 'Validation Fix') ||
        (auditPhaseFilter === 'CLEANSER' && item.phase === 'Cleanser Normalization') ||
        (auditPhaseFilter === 'MANUAL' && item.phase === 'Manual Fix');

      const q = auditSearch.trim().toLowerCase();
      const matchQuery =
        !q ||
        item.field.toLowerCase().includes(q) ||
        item.rule_code.toLowerCase().includes(q) ||
        item.old_value.toLowerCase().includes(q) ||
        item.new_value.toLowerCase().includes(q) ||
        String(item.row).includes(q);

      return matchPhase && matchQuery;
    });
  }, [allAuditItems, auditPhaseFilter, auditSearch]);

  const AUDIT_PAGE_SIZE = 10;
  const auditTotalPages = Math.ceil(filteredAuditItems.length / AUDIT_PAGE_SIZE) || 1;
  const paginatedAuditItems = useMemo(() => {
    const start = (auditPage - 1) * AUDIT_PAGE_SIZE;
    return filteredAuditItems.slice(start, start + AUDIT_PAGE_SIZE);
  }, [filteredAuditItems, auditPage]);

  // Derived warning list
  const rawWarnings = summary ? (Array.isArray(summary.warnings) ? summary.warnings : summary.warnings?.items || []) : [];
  const warningList: WarningItem[] = useMemo(() => {
    return rawWarnings.map((w: any) => {
      if (typeof w === 'string') {
        return { rule_code: 'UNKNOWN', row: 0, field: '', reason: '', message: w };
      }
      return w as WarningItem;
    }).filter((w: WarningItem) => w.row > 0);
  }, [rawWarnings]);

  const downloadWarnings = () => {
    if (!warningList.length) return;

    // Map of row index to warning issues
    const warningMap = new Map<number, string[]>();
    warningList.forEach(w => {
      const idx = w.row - 1;
      if (!warningMap.has(idx)) warningMap.set(idx, []);
      warningMap.get(idx)!.push(`[${w.field}] ${w.reason || w.message}`);
    });

    const dataToDownload = cleanedRows
      .map((row, idx) => {
        if (warningMap.has(idx)) {
          return {
            _WARNING_ISSUE: warningMap.get(idx)!.join(' | '),
            ...row
          } as Record<string, any>;
        }
        return null;
      })
      .filter((item): item is Record<string, any> => Boolean(item));

    dl(expCSV(dataToDownload), 'warnings_records.csv', 'text/csv');
  };

  // Comprehensive Deep Vector PDF Generator for Cleansing & Remediation
  const exportToPDF = () => {
    try {
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pageWidth = doc.internal.pageSize.getWidth();

      // Palette (Exact same palette as Step 3)
      const primaryColor = [14, 116, 144]; // Deep Teal
      const darkText = [30, 41, 59];
      const lightBg = [248, 250, 252];

      const rowCount = summary?.rows_loaded ?? cleanedRows.length ?? 0;
      const rowsModified = summary?.rows_modified_count ?? 0;
      const dynFixCount = summary?.dynamic_fixes?.count ?? summary?.dynamic_fixes?.items?.length ?? 0;
      const valFixCount = summary?.validation_fixes?.count ?? summary?.validation_fixes?.items?.length ?? 0;
      const clsFixCount = summary?.cleanser_fixes?.count ?? summary?.cleanser_fixes?.items?.length ?? 0;
      const manFixCount = summary?.manual_fixes?.count ?? summary?.manual_fixes?.items?.length ?? 0;
      const totalFixes = dynFixCount + valFixCount + clsFixCount + manFixCount;

      // Header Banner
      doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
      doc.rect(0, 0, pageWidth, 28, 'F');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(16);
      doc.setTextColor(255, 255, 255);
      doc.text('SAP Migration Studio — Data Cleansing Report', 14, 14);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.text(`Generated: ${new Date().toLocaleDateString()} | Target Object: ${state.obj} | ${rowCount} Records Processed`, 14, 22);

      let yPos = 36;

      // Executive Title
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(14);
      doc.setTextColor(darkText[0], darkText[1], darkText[2]);
      doc.text(`Data Cleansing & Remediation Report: ${state.obj} Master Data`, 14, yPos);
      yPos += 8;

      // Scorecard Box
      doc.setFillColor(lightBg[0], lightBg[1], lightBg[2]);
      doc.roundedRect(14, yPos, pageWidth - 28, 22, 3, 3, 'F');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
      doc.text(`Overall Remediation Status: ${summary?.overall_status || 'SUCCESS'}  (${totalFixes} Auto-Fixes Applied)`, 20, yPos + 9);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(100, 116, 139);
      doc.text(`Total Records: ${rowCount}  |  Rows Modified: ${rowsModified}  |  Dynamic AI Fixes: ${dynFixCount}  |  Validation Fixes: ${valFixCount}  |  Standard Fixes: ${clsFixCount}`, 20, yPos + 16);

      yPos += 28;

      // Section 1: Executive Summary
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(darkText[0], darkText[1], darkText[2]);
      doc.text('1. Executive Summary', 14, yPos);
      yPos += 6;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9.5);
      doc.setTextColor(71, 85, 105);

      const summaryText = `This report details the automated data cleansing and remediation lifecycle executed for SAP S/4HANA migration of ${state.obj} Master Data. The cleansing engine evaluated ${rowCount} records against configured business validation policies, dynamic AI prompt rules, and standard SAP normalization standards. A total of ${totalFixes} cell-level anomalies across ${rowsModified} records were autonomously remediated with full audit compliance.\n\nAll transformations have been verified for Customer-Vendor Integration (CVI), ISO code standardization, and SAP field length limitations to prevent transactional posting errors in the target S/4HANA system.`;

      const splitSummary = doc.splitTextToSize(summaryText, pageWidth - 28);
      doc.text(splitSummary, 14, yPos);
      yPos += (splitSummary.length * 4.5) + 6;

      // Section 2: Rule Execution & Policy Breakdown
      if (yPos > 240) { doc.addPage(); yPos = 20; }
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(darkText[0], darkText[1], darkText[2]);
      doc.text('2. Cleansing Rules & Execution Breakdown', 14, yPos);
      yPos += 6;

      // Table Header
      doc.setFillColor(241, 245, 249);
      doc.rect(14, yPos, pageWidth - 28, 7, 'F');

      doc.setFontSize(8.5);
      doc.setTextColor(71, 85, 105);
      doc.text('Rule Code', 18, yPos + 5);
      doc.text('Category', 72, yPos + 5);
      doc.text('Target Field', 115, yPos + 5);
      doc.text('Fix Count', 152, yPos + 5);
      doc.text('Status', 178, yPos + 5);
      yPos += 7;

      // Collect rule list
      const rulesList: Array<{ code: string; cat: string; field: string; count: number; status: string }> = [];

      (summary?.dynamic_fixes?.items || []).forEach(item => {
        const existing = rulesList.find(r => r.code === (item.rule_code || 'DYNAMIC_AI') && r.field === item.field);
        if (existing) {
          existing.count += 1;
        } else {
          rulesList.push({
            code: item.rule_code || 'DYNAMIC_AI',
            cat: 'Dynamic AI',
            field: item.field || 'MULTIPLE',
            count: 1,
            status: 'APPLIED'
          });
        }
      });

      (summary?.validation_fixes?.items || []).forEach(item => {
        const existing = rulesList.find(r => r.code === item.rule_code && r.field === item.field);
        if (existing) {
          existing.count += 1;
        } else {
          rulesList.push({
            code: item.rule_code || 'VALIDATION_FIX',
            cat: 'Validation Fix',
            field: item.field || 'MULTIPLE',
            count: 1,
            status: 'APPLIED'
          });
        }
      });

      (summary?.cleanser_fixes?.items || []).forEach(item => {
        const existing = rulesList.find(r => r.code === item.rule_code && r.field === item.field);
        if (existing) {
          existing.count += 1;
        } else {
          rulesList.push({
            code: item.rule_code || 'CLEANSER_STD',
            cat: 'Standard Rule',
            field: item.field || 'GENERAL',
            count: 1,
            status: 'APPLIED'
          });
        }
      });

      if (rulesList.length === 0) {
        rulesList.push({
          code: 'NO_ANOMALIES',
          cat: 'Standard',
          field: 'ALL',
          count: 0,
          status: 'CLEAN'
        });
      }

      doc.setFont('helvetica', 'normal');
      rulesList.forEach((r, index) => {
        if (yPos > 275) {
          doc.addPage();
          yPos = 20;
        }

        if (index % 2 === 1) {
          doc.setFillColor(248, 250, 252);
          doc.rect(14, yPos, pageWidth - 28, 6, 'F');
        }

        doc.setTextColor(darkText[0], darkText[1], darkText[2]);
        doc.text(String(r.code).substring(0, 24), 18, yPos + 4.5);
        doc.text(String(r.cat).substring(0, 18), 72, yPos + 4.5);
        doc.text(String(r.field).substring(0, 14), 115, yPos + 4.5);
        doc.text(`${r.count} rows`, 152, yPos + 4.5);

        doc.setTextColor(16, 185, 129);
        doc.text(r.status, 178, yPos + 4.5);
        yPos += 6;
      });

      yPos += 6;

      // Section 3: Field Transformation & Remediation Summary
      const fixGroups = [
        ...groupFixItems(summary?.dynamic_fixes?.items || []),
        ...groupFixItems(summary?.validation_fixes?.items || []),
        ...groupFixItems(summary?.cleanser_fixes?.items || []),
        ...groupFixItems(summary?.manual_fixes?.items || []),
      ];

      if (fixGroups.length > 0) {
        if (yPos > 230) { doc.addPage(); yPos = 20; }
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.setTextColor(darkText[0], darkText[1], darkText[2]);
        doc.text('3. Field Transformation & Remediation Summary', 14, yPos);
        yPos += 6;

        // Table Header
        doc.setFillColor(241, 245, 249);
        doc.rect(14, yPos, pageWidth - 28, 7, 'F');

        doc.setFontSize(8.5);
        doc.setTextColor(71, 85, 105);
        doc.text('Target Field', 18, yPos + 5);
        doc.text('Rule Code', 62, yPos + 5);
        doc.text('Impacted', 112, yPos + 5);
        doc.text('Sample (Old -> Cleansed)', 142, yPos + 5);
        yPos += 7;

        doc.setFont('helvetica', 'normal');
        fixGroups.forEach((g, index) => {
          if (yPos > 275) {
            doc.addPage();
            yPos = 20;
          }

          if (index % 2 === 1) {
            doc.setFillColor(248, 250, 252);
            doc.rect(14, yPos, pageWidth - 28, 6, 'F');
          }

          const sampleItem = g.items[0];
          const oldSample = String(sampleItem?.old || '(empty)').substring(0, 10);
          const newSample = String(sampleItem?.new || '(cleansed)').substring(0, 12);
          const sampleStr = `${oldSample} -> ${newSample}`;

          doc.setTextColor(darkText[0], darkText[1], darkText[2]);
          doc.text(String(g.field || 'GENERAL').substring(0, 18), 18, yPos + 4.5);
          doc.text(String(g.rule_code).substring(0, 22), 62, yPos + 4.5);
          doc.text(`${g.count} row(s)`, 112, yPos + 4.5);
          doc.text(sampleStr, 142, yPos + 4.5);

          yPos += 6;
        });

        yPos += 6;
      }

      // SECTION 4: DETAILED CLEANSING & REMEDIATION AUDIT LOG (ROW-LEVEL AUDIT)
      if (allAuditItems.length > 0) {
        doc.addPage();
        yPos = 20;

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(12);
        doc.setTextColor(darkText[0], darkText[1], darkText[2]);
        doc.text('4. Detailed Cleansing & Remediation Audit Log (Row-Level Audit)', 14, yPos);
        yPos += 8;

        // Table Header
        doc.setFillColor(241, 245, 249);
        doc.rect(14, yPos, pageWidth - 28, 7, 'F');

        doc.setFontSize(8);
        doc.setTextColor(71, 85, 105);
        doc.text('Row / Key', 16, yPos + 5);
        doc.text('Rule Code', 52, yPos + 5);
        doc.text('Field Name', 88, yPos + 5);
        doc.text('Transformation (Old -> New)', 118, yPos + 5);
        doc.text('Status', 178, yPos + 5);
        yPos += 7;

        doc.setFont('helvetica', 'normal');
        allAuditItems.forEach((item, fIdx) => {
          if (yPos > 275) {
            doc.addPage();
            yPos = 20;

            // Re-render header on new page for readability
            doc.setFillColor(241, 245, 249);
            doc.rect(14, yPos, pageWidth - 28, 7, 'F');
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(8);
            doc.setTextColor(71, 85, 105);
            doc.text('Row / Key', 16, yPos + 5);
            doc.text('Rule Code', 52, yPos + 5);
            doc.text('Field Name', 88, yPos + 5);
            doc.text('Transformation (Old -> New)', 118, yPos + 5);
            doc.text('Status', 178, yPos + 5);
            doc.setFont('helvetica', 'normal');
            yPos += 7;
          }

          if (fIdx % 2 === 1) {
            doc.setFillColor(252, 253, 254);
            doc.rect(14, yPos, pageWidth - 28, 5.5, 'F');
          }

          const rowObj = cleanedRows[item.row - 1] || {};
          const pkKey = state.obj === 'VENDOR' ? 'LIFNR' : state.obj === 'MATERIAL' ? 'MATNR' : 'KUNNR';
          const pkVal = rowObj[pkKey] || rowObj[pkKey.toLowerCase()] || rowObj[pkKey.toUpperCase()] || '';
          const rowIdent = pkVal ? `#${item.row} (${String(pkVal).substring(0, 10)})` : `Row #${item.row}`;

          doc.setFontSize(7.5);
          doc.setTextColor(darkText[0], darkText[1], darkText[2]);
          doc.text(rowIdent, 16, yPos + 4);
          doc.text(String(item.rule_code).substring(0, 16), 52, yPos + 4);
          doc.text(String(item.field).substring(0, 14), 88, yPos + 4);

          const oldStr = String(item.old_value || '(empty)').substring(0, 12);
          const newStr = String(item.new_value || '').substring(0, 14);
          doc.text(`${oldStr} -> ${newStr}`, 118, yPos + 4);

          doc.setTextColor(16, 185, 129);
          doc.text('APPLIED', 178, yPos + 4);

          yPos += 5.5;
        });
      }

      doc.save(`Data_Cleansing_Deep_Report_${state.obj}.pdf`);
      toast('Comprehensive Vector PDF Report exported successfully!', 'ok');
    } catch (err: any) {
      console.error(err);
      toast('Failed to generate PDF report', 'err');
    }
  };

  const applyManualFixes = () => {
    if (!summary) return;

    let newCleanedRows = [...cleanedRows];
    let manualFixesList = summary.manual_fixes?.items ? [...summary.manual_fixes.items] : [];

    const fixesApplied = Object.entries(manualFixValues).filter(([_, val]) => val.trim() !== "");
    if (fixesApplied.length === 0) {
      setShowFixModal(false);
      return;
    }

    const appliedSet = new Set<string>();
    const loggedFixes = new Set<string>();

    fixesApplied.forEach(([key, fixValue]) => {
      const [rowStr, field, ruleCode] = key.split('::');
      const rowIndex = parseInt(rowStr, 10) - 1;
      if (isNaN(rowIndex) || rowIndex < 0 || rowIndex >= newCleanedRows.length) return;

      const oldVal = newCleanedRows[rowIndex][field] || "";
      newCleanedRows[rowIndex] = { ...newCleanedRows[rowIndex], [field]: fixValue };

      const logKey = `${rowIndex}_${field}`;
      if (!loggedFixes.has(logKey)) {
        manualFixesList.push({
          rule_code: 'MANUAL_OVERRIDE',
          row: rowIndex + 1,
          field: field,
          old: String(oldVal),
          new: fixValue
        });
        loggedFixes.add(logKey);
      }
      appliedSet.add(key);
    });

    const newWarnings = rawWarnings.filter((w: any) => {
      if (typeof w === 'string') return true;
      const key = `${w.row}::${w.field}::${w.rule_code}`;
      return !appliedSet.has(key);
    });

    const newSummary = { ...summary };
    if (Array.isArray(newSummary.warnings)) {
      newSummary.warnings = newWarnings;
    } else if (newSummary.warnings && newSummary.warnings.items) {
      newSummary.warnings.items = newWarnings;
      newSummary.warnings.count = newWarnings.length;
    }

    newSummary.manual_fixes = {
      count: manualFixesList.length,
      items: manualFixesList
    };

    dispatch({
      type: 'BATCH_UPDATE',
      updates: {
        cleaned: newCleanedRows,
        cleansingSummary: newSummary,
        isCleansedSaved: false
      }
    });

    setManualFixValues({});
    setShowFixModal(false);
    toast(`Applied ${fixesApplied.length} manual fixes successfully`, 'ok');
  };

  async function doCleanse() {
    showLoad('Cleansing…', 'Applying automated fix rules');
    [0, 1, 2, 3, 4, 5, 6, 7].forEach((i) => setTimeout(() => tick(i), 280 + i * 260));

    try {
      let res;
      if (source === 'harmonized') {
        if (!state.projectId || !state.obj) {
          throw new Error("Project or Object not selected.");
        }
        const activeCustomPrompts = cleanserDynamicRules.filter(r => r.enabled).map(r => r.prompt);
        const excludedValRules = validationRules.filter(r => !r.enabled).map(r => r.rule_code);
        res = await fetch(`${import.meta.env.VITE_BACKEND_URL}/api/sap/cleanser/flow`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            project_id: state.projectId,
            target_object: state.obj,
            custom_prompts: activeCustomPrompts,
            excluded_validation_rules: excludedValRules,
            standard_rules_config: standardRules.map(r => ({
              code: r.code,
              name: r.name,
              description: r.description,
              enabled: r.enabled
            }))
          })
        });
      } else {
        if (!standaloneCsv) {
          throw new Error("Upload harmonization CSV first.");
        }
        const formData = new FormData();
        formData.append('harmonization_csv', standaloneCsv);
        if (standaloneValidationCsv) {
          formData.append('validation_report_csv', standaloneValidationCsv);
        }

        res = await fetch(`${import.meta.env.VITE_BACKEND_URL}/api/sap/cleanser/upload-csv`, {
          method: 'POST',
          body: formData,
        });
      }

      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.detail || 'Cleanser failed');

      const fixesCount = (data.summary?.dynamic_fixes?.count || 0) + (data.summary?.validation_fixes?.count || 0) + (data.summary?.cleanser_fixes?.count || 0);

      dispatch({
        type: 'BATCH_UPDATE',
        updates: {
          cleaned: data.cleaned,
          cleansingSummary: data.summary || null,
          isCleansedSaved: false,
          stats: { ...(state.stats || {}), fixes: fixesCount },
        },
      });

      hideLoad();
      toast(`Cleansed ${data.cleaned.length} records · ${fixesCount} auto-fixes applied`, 'ok');
    } catch (err: any) {
      hideLoad();
      toast(err.message || 'Cleanser failed', 'err');
    }
  }

  const saveRulesToDB = async () => {
    if (!state.projectId) {
      toast('No project selected to save rules', 'err');
      return;
    }
    showLoad('Saving rules...', 'Compiling and saving dynamic rules to database');
    try {
      const activeDynamicRules = cleanserDynamicRules.filter(r => r.enabled);

      const payloadRules = activeDynamicRules.map(r => ({
        id: r.id,
        prompt: r.prompt,
        enabled: r.enabled
      }));

      // Save the rules directly to /api/validate/rules/save
      const res2 = await fetch(`${import.meta.env.VITE_BACKEND_URL}/api/validate/rules/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: state.projectId, target_object: state.obj, rules: payloadRules, source: 'cleanse' })
      });
      const resJson = await res2.json().catch(() => (null));

      if (!res2.ok) {
        let msg = 'Failed to save rules';
        try {
          msg = (resJson && (resJson.detail || resJson.message)) || JSON.stringify(resJson) || msg;
        } catch (e) { }
        throw new Error(msg);
      }

      hideLoad();
      toast('Dynamic cleansing rules saved to project', 'ok');
    } catch (err: any) {
      hideLoad();
      toast(err.message || 'Failed to save rules', 'err');
    }
  };

  const saveDataToDB = async () => {
    if (!state.projectId || !state.obj) {
      toast('Project or Object not selected', 'err');
      return;
    }

    showLoad('Saving data...', 'Persisting cleansed records to database');
    try {
      const res = await fetch(`${import.meta.env.VITE_BACKEND_URL}/api/sap/cleanser/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: state.projectId,
          target_object: state.obj,
          payload: state.cleaned
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Failed to save');

      dispatch({ type: 'SET_FIELD', field: 'isCleansedSaved', value: true });
      hideLoad();
      toast('Cleansed data saved successfully!', 'ok');
    } catch (err: any) {
      hideLoad();
      toast(err.message || 'Error saving data', 'err');
    }
  };

  // Rule counters
  const stdActiveCount = standardRules.filter(r => r.enabled).length;
  const valActiveCount = validationRules.filter(r => r.enabled).length;
  const dynActiveCount = cleanserDynamicRules.filter(r => r.enabled).length;

  const filteredStandardRules = standardRules.filter(r =>
    !ruleSearchQuery || r.name.toLowerCase().includes(ruleSearchQuery.toLowerCase()) || r.description.toLowerCase().includes(ruleSearchQuery.toLowerCase())
  );

  const filteredValidationRules = validationRules.filter(r =>
    !ruleSearchQuery || r.rule_code.toLowerCase().includes(ruleSearchQuery.toLowerCase()) || r.field.toLowerCase().includes(ruleSearchQuery.toLowerCase()) || r.message.toLowerCase().includes(ruleSearchQuery.toLowerCase())
  );

  const filteredDynamicRules = cleanserDynamicRules.filter(r =>
    !ruleSearchQuery || r.prompt.toLowerCase().includes(ruleSearchQuery.toLowerCase())
  );


  return (
    <PageLayout>
      {/* Top Header & Source Mode Pills */}
      <PageHeader
        title="Step 6 — AI Cleanse & Fix"
        subtitle="AI autonomously resolves validation errors based on master data context and business rules"
      >
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setSource('harmonized'); dispatch({ type: 'BATCH_UPDATE', updates: { cleaned: [], isCleansedSaved: false, cleansingSummary: null } }); }}
            className={`
              px-3.5 py-1.5 rounded-lg text-[11.5px] font-semibold transition-all duration-200 border cursor-pointer
              ${source === 'harmonized'
                ? 'bg-violet-600 text-white border-violet-600 shadow-md shadow-violet-600/20'
                : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] border-[var(--border)] hover:border-violet-300'}
            `}
          >
            ⚡ Flow
          </button>
          <button
            onClick={() => { setSource('upload'); dispatch({ type: 'BATCH_UPDATE', updates: { cleaned: [], isCleansedSaved: false, cleansingSummary: null } }); }}
            className={`
              px-3.5 py-1.5 rounded-lg text-[11.5px] font-semibold transition-all duration-200 border cursor-pointer
              ${source === 'upload'
                ? 'bg-violet-600 text-white border-violet-600 shadow-md shadow-violet-600/20'
                : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] border-[var(--border)] hover:border-violet-300'}
            `}
          >
            📄 Upload CSV
          </button>
        </div>
      </PageHeader>

      <PageGrid>
        {/* Left Column (Span 4): Consolidated Tabbed Rule Engine Hub */}
        <GridCol span={4}>
          <Card>
            <CardHeader
              title="Cleansing Rule Engine"
              subtitle={`${stdActiveCount + valActiveCount + dynActiveCount} total rules enabled`}
              icon={<Sliders className="w-4 h-4 text-violet-600 dark:text-violet-400" />}
            >
              {activeRuleTab === 'validation' && (
                <button
                  onClick={fetchValidationRules}
                  disabled={loadingValRules}
                  className="px-2.5 py-1 rounded-lg bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white text-[11px] font-bold flex items-center gap-1 cursor-pointer transition-colors"
                  title="Reload Step 5 active validation rules"
                >
                  <RefreshCw className={`w-3 h-3 ${loadingValRules ? 'animate-spin' : ''}`} />
                  {valRulesLoaded ? 'Reload' : 'Load Rules'}
                </button>
              )}
            </CardHeader>

            {/* Rule Engine Tabs (Grid layout to fit sidebar perfectly) */}
            <div className="grid grid-cols-3 border-b border-[var(--border)] bg-[var(--bg-tertiary)]/40 p-1 gap-1">
              <button
                onClick={() => setActiveRuleTab('standard')}
                title={`Standard Rules (${stdActiveCount}/${standardRules.length} active)`}
                className={`py-1.5 px-1 rounded-md text-[10.5px] font-bold transition-all flex items-center justify-center gap-1 cursor-pointer min-w-0 ${activeRuleTab === 'standard'
                  ? 'bg-[var(--bg-primary)] text-violet-600 dark:text-violet-400 shadow-sm border border-[var(--border)]'
                  : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'
                  }`}
              >
                <Sliders className="w-3 h-3 shrink-0" />
                <span className="truncate">Standard</span>
                <span className="px-1 py-0.2 rounded-full text-[8.5px] font-mono bg-violet-100 dark:bg-violet-950 text-violet-700 dark:text-violet-300 shrink-0">
                  {stdActiveCount}
                </span>
              </button>

              <button
                onClick={() => setActiveRuleTab('validation')}
                title={`Validation Rules (${valActiveCount}/${validationRules.length} active)`}
                className={`py-1.5 px-1 rounded-md text-[10.5px] font-bold transition-all flex items-center justify-center gap-1 cursor-pointer min-w-0 ${activeRuleTab === 'validation'
                  ? 'bg-[var(--bg-primary)] text-teal-600 dark:text-teal-400 shadow-sm border border-[var(--border)]'
                  : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'
                  }`}
              >
                <ListFilter className="w-3 h-3 shrink-0" />
                <span className="truncate">Validation</span>
                <span className="px-1 py-0.2 rounded-full text-[8.5px] font-mono bg-teal-100 dark:bg-teal-950 text-teal-700 dark:text-teal-300 shrink-0">
                  {valActiveCount}
                </span>
              </button>

              <button
                onClick={() => setActiveRuleTab('dynamic')}
                title={`Dynamic AI Rules (${dynActiveCount}/${cleanserDynamicRules.length} active)`}
                className={`py-1.5 px-1 rounded-md text-[10.5px] font-bold transition-all flex items-center justify-center gap-1 cursor-pointer min-w-0 ${activeRuleTab === 'dynamic'
                  ? 'bg-[var(--bg-primary)] text-violet-600 dark:text-violet-400 shadow-sm border border-[var(--border)]'
                  : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'
                  }`}
              >
                <Sparkles className="w-3 h-3 text-violet-500 shrink-0" />
                <span className="truncate">Dynamic</span>
                <span className="px-1 py-0.2 rounded-full text-[8.5px] font-mono bg-violet-100 dark:bg-violet-950 text-violet-700 dark:text-violet-300 shrink-0">
                  {dynActiveCount}
                </span>
              </button>
            </div>

            <CardBody className="p-3 space-y-3">
              {/* Search Bar for rules */}
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" />
                <input
                  type="text"
                  value={ruleSearchQuery}
                  onChange={(e) => setRuleSearchQuery(e.target.value)}
                  placeholder={`Filter ${activeRuleTab} rules...`}
                  className="w-full text-[11px] pl-8 pr-2.5 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-violet-500"
                />
              </div>

              {/* TAB 1: Standard Rules */}
              {activeRuleTab === 'standard' && (
                <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
                  {filteredStandardRules.map((rule) => {
                    const isEditing = editingRuleCode === rule.code;
                    return (
                      <div
                        key={rule.code}
                        className={`p-2.5 rounded-xl border transition-all ${rule.overridden
                          ? 'border-amber-200 dark:border-amber-900/40 bg-amber-50/20 dark:bg-amber-950/10 opacity-75'
                          : rule.enabled
                            ? 'border-[var(--border)] bg-[var(--bg-tertiary)]/50'
                            : 'border-[var(--border)] bg-[var(--bg-tertiary)]/15 opacity-60'
                          }`}
                      >
                        {isEditing ? (
                          <div className="space-y-1.5">
                            <input
                              type="text"
                              value={editForm.name}
                              onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                              onKeyDown={(e) => { if (e.key === 'Enter') saveEditStandardRule(rule.code); }}
                              className="w-full text-[11px] font-bold px-2 py-1 rounded border border-violet-400 bg-[var(--bg-primary)] text-[var(--text-primary)]"
                              placeholder="Rule Name"
                            />
                            <input
                              type="text"
                              value={editForm.description}
                              onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                              onKeyDown={(e) => { if (e.key === 'Enter') saveEditStandardRule(rule.code); }}
                              className="w-full text-[10px] px-2 py-1 rounded border border-violet-400 bg-[var(--bg-primary)] text-[var(--text-secondary)]"
                              placeholder="Rule Prompt Description"
                            />
                            <div className="flex items-center justify-end gap-1.5 pt-1">
                              <button
                                onClick={() => saveEditStandardRule(rule.code)}
                                className="p-1 px-2 rounded bg-emerald-600 text-white hover:bg-emerald-700 text-[10px] font-bold flex items-center gap-0.5 cursor-pointer"
                              >
                                <Check className="w-3 h-3" /> Save to Dynamic AI Rule
                              </button>
                              <button
                                onClick={() => setEditingRuleCode(null)}
                                className="p-1 rounded bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:bg-[var(--border)] text-[10px] flex items-center gap-0.5 cursor-pointer"
                              >
                                <X className="w-3 h-3" /> Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-start gap-2">
                            <input
                              type="checkbox"
                              checked={rule.enabled && !rule.overridden}
                              onChange={() => toggleStandardRule(rule.code)}
                              disabled={rule.overridden}
                              className="mt-0.5 h-3.5 w-3.5 rounded border-[var(--border)] text-violet-600 focus:ring-violet-500 cursor-pointer accent-violet-600 disabled:cursor-not-allowed"
                              title={rule.overridden ? "Rule is overridden by Dynamic AI Prompt" : "Toggle rule execution"}
                            />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-1.5 min-w-0">
                                  <span className={`text-[11px] font-bold truncate ${rule.overridden
                                    ? 'text-amber-700 dark:text-amber-300 line-through'
                                    : rule.enabled
                                      ? 'text-emerald-600 dark:text-emerald-400'
                                      : 'text-[var(--text-tertiary)] line-through'
                                    }`}>
                                    {rule.name}
                                  </span>
                                  {rule.overridden && (
                                    <span className="px-1.5 py-0.2 rounded bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200 text-[8px] font-bold uppercase tracking-wider shrink-0">
                                      Overridden
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-0.5 shrink-0">
                                  {rule.overridden && (
                                    <button
                                      onClick={() => restoreStandardRule(rule.code)}
                                      title="Restore original standard rule execution"
                                      className="p-1 rounded text-amber-600 hover:text-amber-700 hover:bg-amber-50 dark:hover:bg-amber-950/30 cursor-pointer transition-colors"
                                    >
                                      <RotateCcw className="w-3 h-3" />
                                    </button>
                                  )}
                                  <button
                                    onClick={() => startEditStandardRule(rule)}
                                    title="Edit & Convert to Dynamic AI Rule"
                                    className="p-1 rounded text-[var(--text-tertiary)] hover:text-violet-600 hover:bg-violet-50 dark:hover:bg-violet-950/30 cursor-pointer transition-colors"
                                  >
                                    <Pencil className="w-3 h-3" />
                                  </button>
                                </div>
                              </div>
                              <div className="text-[10px] text-[var(--text-tertiary)] mt-0.5 truncate">{rule.description}</div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* TAB 2: Validation Rules */}
              {activeRuleTab === 'validation' && (
                <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
                  {!valRulesLoaded ? (
                    <div className="text-center py-6 space-y-2">
                      <div className="text-[11px] text-[var(--text-tertiary)]">Step 5 validation rules not loaded yet.</div>
                      <button
                        onClick={fetchValidationRules}
                        disabled={loadingValRules}
                        className="px-3 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-[11px] font-bold inline-flex items-center gap-1.5 cursor-pointer shadow-sm transition-all"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${loadingValRules ? 'animate-spin' : ''}`} />
                        Import Step 5 Rules
                      </button>
                    </div>
                  ) : filteredValidationRules.length === 0 ? (
                    <div className="text-center py-6 text-[11px] text-[var(--text-tertiary)]">
                      No active validation rules match criteria.
                    </div>
                  ) : (
                    filteredValidationRules.map((rule) => (
                      <div
                        key={rule.rule_code}
                        className={`p-2.5 rounded-xl border transition-all ${rule.enabled
                          ? 'border-teal-200 dark:border-teal-900/50 bg-teal-50/20 dark:bg-teal-950/10'
                          : 'border-[var(--border)] bg-[var(--bg-tertiary)]/15 opacity-60'
                          }`}
                      >
                        <div className="flex items-start gap-2">
                          <input
                            type="checkbox"
                            checked={rule.enabled}
                            onChange={() => toggleValidationRule(rule.rule_code)}
                            className="mt-0.5 h-3.5 w-3.5 rounded border-[var(--border)] text-teal-600 focus:ring-teal-500 cursor-pointer accent-teal-600"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between">
                              <span className={`text-[11px] font-bold ${rule.enabled ? 'text-teal-700 dark:text-teal-300' : 'text-[var(--text-tertiary)] line-through'}`}>
                                {rule.rule_code}
                              </span>
                              <span className="text-[9px] px-1.5 py-0.5 rounded font-mono font-bold bg-teal-100 dark:bg-teal-900/40 text-teal-800 dark:text-teal-300">
                                {rule.count} failing
                              </span>
                            </div>
                            <div className="text-[10px] text-[var(--text-secondary)] font-mono mt-0.5">
                              Field: <strong className="text-[var(--text-primary)]">{rule.field}</strong>
                            </div>
                            <div className="text-[9.5px] text-[var(--text-tertiary)] truncate mt-0.5">{rule.message}</div>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* TAB 3: Dynamic AI Rules */}
              {activeRuleTab === 'dynamic' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] font-bold text-violet-700 dark:text-violet-300">
                      Manage Dynamic Rules
                    </span>
                    <Button variant="secondary" size="sm" icon={<Save className="w-3 h-3" />} onClick={saveRulesToDB}>
                      Save Rules
                    </Button>
                  </div>
                  <div className="flex gap-1.5">
                    <input
                      type="text"
                      value={newDynamicPrompt}
                      onChange={(e) => setNewDynamicPrompt(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') addCleanserDynamicRule(); }}
                      placeholder="Enter custom AI cleansing prompt..."
                      className="flex-1 text-[10.5px] px-2.5 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-violet-500"
                    />
                    <button
                      onClick={addCleanserDynamicRule}
                      className="px-2.5 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-[10.5px] font-bold flex items-center gap-1 cursor-pointer transition-colors shrink-0"
                    >
                      <Plus className="w-3 h-3" /> Add
                    </button>
                  </div>

                  <div className="space-y-2 max-h-[350px] overflow-y-auto pr-1">
                    {filteredDynamicRules.map((rule) => {
                      const isEditing = editingDynamicId === rule.id;
                      return (
                        <div
                          key={rule.id}
                          className={`p-2.5 rounded-xl border transition-all ${rule.enabled
                            ? 'border-violet-200 dark:border-violet-900/50 bg-violet-50/20 dark:bg-violet-950/10'
                            : 'border-[var(--border)] bg-[var(--bg-tertiary)]/15 opacity-60'
                            }`}
                        >
                          {isEditing ? (
                            <div className="space-y-1.5">
                              <input
                                type="text"
                                value={editDynamicPromptText}
                                onChange={(e) => setEditDynamicPromptText(e.target.value)}
                                className="w-full text-[10.5px] px-2 py-1 rounded border border-violet-400 bg-[var(--bg-primary)] text-[var(--text-primary)]"
                              />
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  onClick={() => saveEditDynamicRule(rule.id)}
                                  className="p-1 rounded bg-emerald-600 text-white hover:bg-emerald-700 text-[10px] font-bold flex items-center gap-0.5 cursor-pointer"
                                >
                                  <Check className="w-3 h-3" /> Save
                                </button>
                                <button
                                  onClick={() => setEditingDynamicId(null)}
                                  className="p-1 rounded bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:bg-[var(--border)] text-[10px] flex items-center gap-0.5 cursor-pointer"
                                >
                                  <X className="w-3 h-3" /> Cancel
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-start gap-2">
                              <input
                                type="checkbox"
                                checked={rule.enabled}
                                onChange={() => toggleCleanserDynamicRule(rule.id)}
                                className="mt-0.5 h-3.5 w-3.5 rounded border-[var(--border)] text-violet-600 focus:ring-violet-500 cursor-pointer accent-violet-600"
                              />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-start justify-between gap-1">
                                  <div className="flex-1 min-w-0">
                                    {(rule.id.startsWith('OVERRIDE_') || /(delete|remove|drop|purge|filter out|discard|prune)/i.test(rule.prompt)) && (
                                      <div className="flex flex-wrap items-center gap-1 mb-1">
                                        {rule.id.startsWith('OVERRIDE_') && (
                                          <span className="px-1.5 py-0.2 rounded bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200 text-[8px] font-bold uppercase tracking-wider">
                                            ⚡ Overridden Standard
                                          </span>
                                        )}
                                        {/(delete|remove|drop|purge|filter out|discard|prune)/i.test(rule.prompt) && (
                                          <span className="px-1.5 py-0.2 rounded bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300 text-[8px] font-bold uppercase tracking-wider border border-rose-200 dark:border-rose-800/50">
                                            ⚠️ Row Deletion (Unsafe)
                                          </span>
                                        )}
                                      </div>
                                    )}
                                    <span className={`text-[10.5px] leading-snug block whitespace-pre-wrap ${rule.enabled ? 'text-[var(--text-primary)] font-medium' : 'text-[var(--text-tertiary)] line-through'}`}>
                                      {rule.prompt}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-0.5 shrink-0">
                                    <button
                                      onClick={() => startEditDynamicRule(rule)}
                                      title="Edit Prompt"
                                      className="p-1 rounded text-[var(--text-tertiary)] hover:text-violet-600 hover:bg-violet-50 dark:hover:bg-violet-950/30 cursor-pointer transition-colors"
                                    >
                                      <Pencil className="w-3 h-3" />
                                    </button>
                                    <button
                                      onClick={() => deleteCleanserDynamicRule(rule.id)}
                                      title="Delete Rule"
                                      className="p-1 rounded text-[var(--text-tertiary)] hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 cursor-pointer transition-colors"
                                    >
                                      <Trash2 className="w-3 h-3" />
                                    </button>
                                  </div>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </CardBody>
          </Card>
        </GridCol>

        {/* Right Column (Span 8): Main Action Toolbar & Reports Workspace */}
        <GridCol span={8}>
          {/* Main Action Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border)] shadow-sm">
            <Button variant="secondary" icon={<ArrowLeft className="w-3.5 h-3.5" />} onClick={() => navigate('/validate')}>
              Back
            </Button>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="primary"
                icon={<Bot className="w-4 h-4" />}
                onClick={doCleanse}
                disabled={source === 'upload' && !standaloneCsv}
                className="bg-violet-600 hover:bg-violet-700 text-white shadow-violet-600/20"
              >
                Auto-Fix with AI
              </Button>

              <div title={!has ? "Run cleanse first before saving." : ""}>
                <Button variant="secondary" icon={<Save className="w-3.5 h-3.5" />} onClick={saveDataToDB} disabled={!has}>
                  Save Data
                </Button>
              </div>

              <div title={!state.isCleansedSaved ? "You must save your data before proceeding to Step 7." : ""}>
                <Button
                  variant="primary"
                  icon={<ArrowRight className="w-3.5 h-3.5" />}
                  onClick={() => navigate('/transform')}
                  disabled={!state.isCleansedSaved}
                >
                  Next: Transform
                </Button>
              </div>
            </div>
          </div>

          {/* Standalone Upload Dropzone */}
          {source === 'upload' && (
            <Card>
              <CardHeader title="Upload Harmonization & Validation Data" subtitle="Select local files to cleanse without project context" />
              <CardBody className="p-4 space-y-3">
                <div className="flex items-center gap-3 p-3 rounded-lg border border-dashed border-[var(--border)] bg-[var(--bg-tertiary)]/30">
                  <input
                    ref={csvInputRef}
                    type="file"
                    accept=".csv"
                    className="hidden"
                    onChange={(e) => setStandaloneCsv(e.target.files?.[0] || null)}
                  />
                  <Button variant="secondary" size="sm" icon={<Upload className="w-3.5 h-3.5" />} onClick={() => csvInputRef.current?.click()}>
                    {standaloneCsv ? standaloneCsv.name : 'Choose Harmonization CSV…'}
                  </Button>
                  <span className="text-[11px] text-[var(--text-tertiary)] font-mono">(Required)</span>
                </div>
                <div className="flex items-center gap-3 p-3 rounded-lg border border-dashed border-[var(--border)] bg-[var(--bg-tertiary)]/30">
                  <input
                    ref={valCsvInputRef}
                    type="file"
                    accept=".csv,.json"
                    className="hidden"
                    onChange={(e) => setStandaloneValidationCsv(e.target.files?.[0] || null)}
                  />
                  <Button variant="secondary" size="sm" icon={<Upload className="w-3.5 h-3.5" />} onClick={() => valCsvInputRef.current?.click()}>
                    {standaloneValidationCsv ? standaloneValidationCsv.name : 'Choose Validation Report CSV…'}
                  </Button>
                  <span className="text-[11px] text-[var(--text-tertiary)] font-mono">(Optional)</span>
                </div>
              </CardBody>
            </Card>
          )}

          {/* Executive Summary Card */}
          {summary && (
            <Card>
              <CardHeader
                title="Executive Cleansing Summary Report"
                subtitle={`Project: ${state.projectId || 'Default Project'} · Target: ${state.obj || 'Customer Master'} · Status: ${summary.overall_status || 'SUCCESS'}`}
                icon={<Sparkles className="w-4 h-4 text-violet-600 dark:text-violet-400" />}
              >
                <div className="flex items-center gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={<Download className="w-3 h-3 text-indigo-500" />}
                    onClick={exportToPDF}
                  >
                    Export Vector PDF
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={<FileJson className="w-3 h-3" />}
                    onClick={() => dl(exportExecutiveSummaryJSON(summary, state.projectId || 'Default Project', state.obj || 'Customer Master'), 'cleansing_summary.json', 'application/json')}
                  >
                    Export JSON
                  </Button>
                  <button
                    onClick={() => setOpenSummaryAccordion(!openSummaryAccordion)}
                    className="p-1.5 rounded-lg hover:bg-[var(--bg-tertiary)] text-[var(--text-tertiary)] cursor-pointer transition-colors"
                    title={openSummaryAccordion ? "Collapse Summary" : "Expand Summary"}
                  >
                    {openSummaryAccordion ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>
                </div>
              </CardHeader>

              {openSummaryAccordion && (
                <CardBody className="space-y-4 pt-2">
                  <StatsGrid>
                    <StatBox value={summary.rows_loaded ?? 0} label="Rows Loaded" color="var(--color-primary-500)" />
                    <StatBox value={summary.rows_modified_count ?? 0} label="Rows Modified" color="var(--color-warning)" />
                    <StatBox value={summary.dynamic_fixes?.count ?? summary.dynamic_fixes?.items?.length ?? 0} label="Dynamic AI Fixes" color="var(--color-violet)" />
                    <StatBox value={summary.validation_fixes?.count ?? summary.validation_fixes?.total ?? summary.validation_fixes?.items?.length ?? 0} label="Validation Fixes" color="var(--color-teal)" />
                    <StatBox value={summary.cleanser_fixes?.count ?? summary.cleanser_fixes?.total ?? summary.cleanser_fixes?.items?.length ?? 0} label="Cleanser Fixes" color="var(--color-success)" />
                  </StatsGrid>

                  {/* 1. Dynamic AI Fixes Breakdown */}
                  {summary.dynamic_fixes?.items && summary.dynamic_fixes.items.length > 0 && (
                    <div className="p-3.5 rounded-xl border border-violet-200 dark:border-violet-900/50 bg-[var(--bg-tertiary)]/40 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-[12px] font-bold text-[var(--text-primary)]">
                          <span>⚡</span>
                          <span>Dynamic AI Rule Fixes</span>
                          <span className="px-2.5 py-0.5 rounded-full text-[9.5px] font-mono font-bold bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300">
                            {summary.dynamic_fixes.items.length} applied
                          </span>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {groupFixItems(summary.dynamic_fixes.items).map((group) => {
                          const gKey = `dyn::${group.rule_code}::${group.field}`;
                          const isExp = !!expandedGroups[gKey];
                          const itemsDisp = isExp ? group.items : group.items.slice(0, 3);
                          return (
                            <div key={gKey} className="p-3 rounded-lg bg-[var(--bg-primary)] border border-[var(--border)] shadow-sm space-y-2 flex flex-col justify-between">
                              <div>
                                <div className="flex items-center justify-between gap-2 pb-1.5 border-b border-[var(--border)] mb-2">
                                  <div className="font-mono text-[11px] font-bold text-[var(--text-primary)] truncate">{group.rule_code}</div>
                                  <span className="text-[9.5px] px-1.5 py-0.5 rounded font-mono font-bold bg-[var(--bg-tertiary)] text-[var(--text-secondary)] shrink-0 border border-[var(--border)]">{group.count} rows</span>
                                </div>
                                {group.field && <div className="text-[10px] text-[var(--text-tertiary)] font-mono mb-2">Field: <strong className="text-[var(--text-primary)]">{group.field}</strong></div>}
                                <div className="space-y-1 font-mono text-[10px]">
                                  {itemsDisp.map((item, idx) => (
                                    <div key={idx} className="flex items-center justify-between p-1.5 rounded bg-[var(--bg-tertiary)]/60 gap-1.5">
                                      <span className="text-[var(--text-tertiary)] shrink-0 font-bold">Row #{item.row}</span>
                                      <span className="truncate text-right">
                                        <span className="line-through text-red-500 opacity-80">{String(item.old || '(empty)').slice(0, 14)}</span>
                                        <span className="text-[var(--text-tertiary)]"> → </span>
                                        <span className="text-emerald-600 dark:text-emerald-400 font-bold">{String(item.new).slice(0, 16)}</span>
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                              {group.items.length > 3 && (
                                <button onClick={() => toggleGroup(gKey)} className="w-full text-center text-[10px] font-bold text-violet-600 dark:text-violet-400 hover:underline pt-2 border-t border-[var(--border)] flex items-center justify-center gap-1 cursor-pointer">
                                  {isExp ? <>Show less <ChevronUp className="w-3 h-3" /></> : <>+ {group.items.length - 3} more <ChevronDown className="w-3 h-3" /></>}
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* 2. Validation Fixes Breakdown */}
                  {summary.validation_fixes?.items && summary.validation_fixes.items.length > 0 && (
                    <div className="p-3.5 rounded-xl border border-teal-200 dark:border-teal-900/50 bg-[var(--bg-tertiary)]/40 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-[12px] font-bold text-[var(--text-primary)]">
                          <span>🛠️</span>
                          <span>Validation-Directed Fixes</span>
                          <span className="px-2.5 py-0.5 rounded-full text-[9.5px] font-mono font-bold bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300">
                            {summary.validation_fixes.items.length} applied
                          </span>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {groupFixItems(summary.validation_fixes.items).map((group) => {
                          const gKey = `val::${group.rule_code}::${group.field}`;
                          const isExp = !!expandedGroups[gKey];
                          const itemsDisp = isExp ? group.items : group.items.slice(0, 3);
                          return (
                            <div key={gKey} className="p-3 rounded-lg bg-[var(--bg-primary)] border border-[var(--border)] shadow-sm space-y-2 flex flex-col justify-between">
                              <div>
                                <div className="flex items-center justify-between gap-2 pb-1.5 border-b border-[var(--border)] mb-2">
                                  <div className="font-mono text-[11px] font-bold text-[var(--text-primary)] truncate">{group.rule_code}</div>
                                  <span className="text-[9.5px] px-1.5 py-0.5 rounded font-mono font-bold bg-[var(--bg-tertiary)] text-[var(--text-secondary)] shrink-0 border border-[var(--border)]">{group.count} rows</span>
                                </div>
                                {group.field && <div className="text-[10px] text-[var(--text-tertiary)] font-mono mb-2">Field: <strong className="text-[var(--text-primary)]">{group.field}</strong></div>}
                                <div className="space-y-1 font-mono text-[10px]">
                                  {itemsDisp.map((item, idx) => (
                                    <div key={idx} className="flex items-center justify-between p-1.5 rounded bg-[var(--bg-tertiary)]/60 gap-1.5">
                                      <span className="text-[var(--text-tertiary)] shrink-0 font-bold">Row #{item.row}</span>
                                      <span className="truncate text-right">
                                        <span className="line-through text-red-500 opacity-80">{String(item.old || '(empty)').slice(0, 14)}</span>
                                        <span className="text-[var(--text-tertiary)]"> → </span>
                                        <span className="text-emerald-600 dark:text-emerald-400 font-bold">{String(item.new).slice(0, 16)}</span>
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                              {group.items.length > 3 && (
                                <button onClick={() => toggleGroup(gKey)} className="w-full text-center text-[10px] font-bold text-teal-600 dark:text-teal-400 hover:underline pt-2 border-t border-[var(--border)] flex items-center justify-center gap-1 cursor-pointer">
                                  {isExp ? <>Show less <ChevronUp className="w-3 h-3" /></> : <>+ {group.items.length - 3} more <ChevronDown className="w-3 h-3" /></>}
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* 3. Cleanser Normalization Breakdown */}
                  {summary.cleanser_fixes?.items && summary.cleanser_fixes.items.length > 0 && (
                    <div className="p-3.5 rounded-xl border border-emerald-200 dark:border-emerald-900/50 bg-[var(--bg-tertiary)]/40 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-[12px] font-bold text-[var(--text-primary)]">
                          <span>🧹</span>
                          <span>Cleanser Normalizations</span>
                          <span className="px-2.5 py-0.5 rounded-full text-[9.5px] font-mono font-bold bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300">
                            {summary.cleanser_fixes.items.length} applied
                          </span>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {groupFixItems(summary.cleanser_fixes.items).map((group) => {
                          const gKey = `cls::${group.rule_code}::${group.field}`;
                          const isExp = !!expandedGroups[gKey];
                          const itemsDisp = isExp ? group.items : group.items.slice(0, 3);
                          return (
                            <div key={gKey} className="p-3 rounded-lg bg-[var(--bg-primary)] border border-[var(--border)] shadow-sm space-y-2 flex flex-col justify-between">
                              <div>
                                <div className="flex items-center justify-between gap-2 pb-1.5 border-b border-[var(--border)] mb-2">
                                  <div className="font-mono text-[11px] font-bold text-[var(--text-primary)] truncate">{group.rule_code}</div>
                                  <span className="text-[9.5px] px-1.5 py-0.5 rounded font-mono font-bold bg-[var(--bg-tertiary)] text-[var(--text-secondary)] shrink-0 border border-[var(--border)]">{group.count} rows</span>
                                </div>
                                {group.field && <div className="text-[10px] text-[var(--text-tertiary)] font-mono mb-2">Field: <strong className="text-[var(--text-primary)]">{group.field}</strong></div>}
                                <div className="space-y-1 font-mono text-[10px]">
                                  {itemsDisp.map((item, idx) => (
                                    <div key={idx} className="flex items-center justify-between p-1.5 rounded bg-[var(--bg-tertiary)]/60 gap-1.5">
                                      <span className="text-[var(--text-tertiary)] shrink-0 font-bold">Row #{item.row}</span>
                                      <span className="truncate text-right">
                                        <span className="line-through text-red-500 opacity-80">{String(item.old || '(empty)').slice(0, 14)}</span>
                                        <span className="text-[var(--text-tertiary)]"> → </span>
                                        <span className="text-emerald-600 dark:text-emerald-400 font-bold">{String(item.new).slice(0, 16)}</span>
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                              {group.items.length > 3 && (
                                <button onClick={() => toggleGroup(gKey)} className="w-full text-center text-[10px] font-bold text-emerald-600 dark:text-emerald-400 hover:underline pt-2 border-t border-[var(--border)] flex items-center justify-center gap-1 cursor-pointer">
                                  {isExp ? <>Show less <ChevronUp className="w-3 h-3" /></> : <>+ {group.items.length - 3} more <ChevronDown className="w-3 h-3" /></>}
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Priority Rule Overrides */}
                  {summary.priority_overrides?.standard_rules_skipped && summary.priority_overrides.standard_rules_skipped.length > 0 && (
                    <div className="p-3 rounded-xl border border-amber-200 dark:border-amber-900/40 bg-amber-50/20 dark:bg-amber-950/10 space-y-1.5">
                      <div className="text-[11px] font-bold text-amber-700 dark:text-amber-300 flex items-center gap-1.5">
                        <span>⚡ Priority Rule Overrides</span>
                        <span className="text-[9.5px] font-normal text-[var(--text-tertiary)]">
                          (Standard rules skipped because dynamic rules took precedence)
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1 pt-0.5">
                        {summary.priority_overrides.standard_rules_skipped.map((r, i) => (
                          <span key={i} className="px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300 font-mono text-[10px] font-semibold">
                            Skipped {r}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Manual Review Items */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-[11.5px] font-bold text-[var(--text-secondary)]">
                        Manual Review Items / Warnings ({warningList.length})
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="secondary"
                          size="sm"
                          icon={<Download className="w-3.5 h-3.5" />}
                          onClick={downloadWarnings}
                          disabled={warningList.length === 0}
                        >
                          Download Warning Records
                        </Button>
                        <Button
                          variant="primary"
                          size="sm"
                          icon={<Pencil className="w-3.5 h-3.5" />}
                          onClick={() => {
                            setManualFixValues({});
                            setShowFixModal(true);
                          }}
                          disabled={warningList.length === 0}
                          className="bg-amber-600 hover:bg-amber-700 text-white"
                        >
                          Fix Warnings
                        </Button>
                      </div>
                    </div>
                    {warningList.length ? (
                      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-tertiary)] p-3 space-y-2 max-h-56 overflow-y-auto">
                        {warningList.map((warning, i) => (
                          <div key={i} className="p-2 rounded-lg bg-[var(--bg-primary)] border border-amber-200 dark:border-amber-900/50 flex flex-col gap-1 text-[11px] font-mono">
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-amber-700 dark:text-amber-400">{warning.rule_code}</span>
                              <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300">Row #{warning.row}</span>
                            </div>
                            <div className="text-[10px] text-[var(--text-tertiary)]">
                              Field: <strong className="text-[var(--text-primary)]">{warning.field}</strong>
                            </div>
                            <div className="text-[10px] text-amber-600 dark:text-amber-500 mt-0.5">{warning.reason || warning.message}</div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <InfoBox variant="success">All rules evaluated cleanly without manual review warnings.</InfoBox>
                    )}
                  </div>
                </CardBody>
              )}
            </Card>
          )}
        </GridCol>
      </PageGrid>

      {/* Full-Width Output Section (Audit Log & Cleansed Data Preview — Same as Step 7 Transform) */}
      <div className="mt-6 space-y-6">
        {/* Interactive Audit Log Card */}
        {summary && (
          <Card>
            <CardHeader
              title="Cleansing Audit Log & Change Trail"
              subtitle={`${allAuditItems.length} cell-level transformation events logged`}
              icon={<FileText className="w-4 h-4 text-violet-600 dark:text-violet-400" />}
            >
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  icon={<Download className="w-3 h-3 text-indigo-500" />}
                  onClick={exportToPDF}
                >
                  Export Vector PDF
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  icon={<Download className="w-3 h-3" />}
                  onClick={() => dl(exportAuditLogCSV(summary, state.projectId || 'Default Project', state.obj || 'Customer Master'), 'cleansing_audit_log.csv', 'text/csv')}
                >
                  Export Audit CSV
                </Button>
                <button
                  onClick={() => setOpenAuditAccordion(!openAuditAccordion)}
                  className="px-2.5 py-1.5 rounded-lg bg-[var(--bg-tertiary)] hover:bg-[var(--border)] text-[11px] font-bold text-violet-600 dark:text-violet-400 flex items-center gap-1.5 cursor-pointer transition-colors border border-[var(--border)]"
                >
                  {openAuditAccordion ? (
                    <>▼ Hide Complete Audit Trail</>
                  ) : (
                    <>▶ View Complete Audit Trail ({allAuditItems.length} log entries)</>
                  )}
                </button>
              </div>
            </CardHeader>

            {openAuditAccordion && (
              <CardBody className="space-y-3 pt-2">
                {/* Search & Phase Filter Bar */}
                <div className="flex flex-col sm:flex-row items-center justify-between gap-2 p-2 rounded-xl bg-[var(--bg-tertiary)]/50 border border-[var(--border)]">
                  <div className="relative flex-1 w-full">
                    <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" />
                    <input
                      type="text"
                      value={auditSearch}
                      onChange={(e) => { setAuditSearch(e.target.value); setAuditPage(1); }}
                      placeholder="Search audit log by field, rule code, row #, or value..."
                      className="w-full text-[11px] pl-8 pr-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-violet-500"
                    />
                  </div>
                  <div className="flex items-center gap-1 shrink-0 w-full sm:w-auto overflow-x-auto pb-0.5">
                    {[
                      ['ALL', `All (${allAuditItems.length})`],
                      ['DYNAMIC', `⚡ Dynamic AI (${summary.dynamic_fixes?.items?.length || 0})`],
                      ['VALIDATION', `🛠️ Validation (${summary.validation_fixes?.items?.length || 0})`],
                      ['CLEANSER', `🧹 Cleanser (${summary.cleanser_fixes?.items?.length || 0})`],
                      ['MANUAL', `🖐️ Manual Fix (${summary.manual_fixes?.items?.length || 0})`],
                    ].map(([key, label]) => (
                      <button
                        key={key}
                        onClick={() => { setAuditPhaseFilter(key); setAuditPage(1); }}
                        className={`px-2.5 py-1 rounded-md text-[10px] font-bold transition-all cursor-pointer whitespace-nowrap ${auditPhaseFilter === key
                          ? 'bg-violet-600 text-white shadow-sm'
                          : 'bg-[var(--bg-primary)] text-[var(--text-secondary)] border border-[var(--border)] hover:border-violet-300'
                          }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Audit Log Table */}
                {filteredAuditItems.length === 0 ? (
                  <div className="text-center py-6 text-[11px] text-[var(--text-tertiary)] font-mono">
                    No audit log transformation events match your search/filter criteria.
                  </div>
                ) : (
                  <div className="rounded-xl border border-[var(--border)] overflow-hidden">
                    <table className="w-full text-left border-collapse">
                      <thead className="bg-[var(--bg-tertiary)] text-[10px] font-bold text-[var(--text-tertiary)] uppercase tracking-wider border-b border-[var(--border)]">
                        <tr>
                          <th className="py-2.5 px-3">Record Identifier</th>
                          <th className="py-2.5 px-3">Phase</th>
                          <th className="py-2.5 px-3">Rule Code</th>
                          <th className="py-2.5 px-3">Field Name</th>
                          <th className="py-2.5 px-3">Transformation (Before → After)</th>
                          <th className="py-2.5 px-3 text-right">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--border)] text-[10.5px] font-mono">
                        {paginatedAuditItems.map((item) => {
                          const isDyn = item.phase === 'Dynamic AI Rule';
                          const isVal = item.phase === 'Validation Fix';
                          const rowObj = cleanedRows[item.row - 1] || {};
                          const pkKey = state.obj === 'VENDOR' ? 'LIFNR' : state.obj === 'MATERIAL' ? 'MATNR' : 'KUNNR';
                          const pkVal = rowObj[pkKey] || rowObj[pkKey.toLowerCase()] || rowObj[pkKey.toUpperCase()] || '';
                          return (
                            <tr key={item.id} className="hover:bg-[var(--bg-tertiary)]/40 transition-colors">
                              <td className="py-2 px-3 whitespace-nowrap">
                                <div className="flex flex-col">
                                  <span className="text-[10.5px] font-bold text-[var(--text-secondary)] font-mono">Row #{item.row}</span>
                                  {pkVal && (
                                    <span className="text-[9.5px] font-mono text-violet-600 dark:text-violet-400 font-bold">
                                      {pkKey}: {pkVal}
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="py-2 px-3">
                                <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${isDyn
                                  ? 'bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300'
                                  : isVal
                                    ? 'bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300'
                                    : 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300'
                                  }`}>
                                  {item.phase}
                                </span>
                              </td>
                              <td className="py-2 px-3 font-bold text-[var(--text-primary)]">{item.rule_code}</td>
                              <td className="py-2 px-3 text-violet-600 dark:text-violet-400 font-bold">{item.field}</td>
                              <td className="py-2 px-3">
                                <div className="flex items-center gap-1">
                                  <span className="px-1.5 py-0.5 rounded bg-red-500/10 text-red-600 dark:text-red-400 line-through text-[10px]">
                                    {item.old_value || '(empty)'}
                                  </span>
                                  <span className="text-[var(--text-tertiary)]">→</span>
                                  <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-bold text-[10px]">
                                    {item.new_value}
                                  </span>
                                </div>
                              </td>
                              <td className="py-2 px-3 text-right">
                                <span className="px-1.5 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 text-[9px] font-bold">
                                  APPLIED
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>

                    {/* Pagination Controls */}
                    {auditTotalPages > 1 && (
                      <div className="flex items-center justify-between px-3 py-2 bg-[var(--bg-tertiary)]/50 border-t border-[var(--border)] text-[11px] text-[var(--text-secondary)]">
                        <div>
                          Showing {((auditPage - 1) * AUDIT_PAGE_SIZE) + 1}–{Math.min(auditPage * AUDIT_PAGE_SIZE, filteredAuditItems.length)} of {filteredAuditItems.length}
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => setAuditPage(p => Math.max(1, p - 1))}
                            disabled={auditPage === 1}
                            className="p-1 rounded border border-[var(--border)] bg-[var(--bg-primary)] hover:bg-[var(--bg-tertiary)] disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
                          >
                            <ChevronLeft className="w-3.5 h-3.5" />
                          </button>
                          <span className="px-2 font-mono font-bold">{auditPage} / {auditTotalPages}</span>
                          <button
                            onClick={() => setAuditPage(p => Math.min(auditTotalPages, p + 1))}
                            disabled={auditPage === auditTotalPages}
                            className="p-1 rounded border border-[var(--border)] bg-[var(--bg-primary)] hover:bg-[var(--bg-tertiary)] disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
                          >
                            <ChevronRight className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </CardBody>
            )}
          </Card>
        )}

        {/* Cleansed Data Preview (Multi-Table Display) */}
        <Card>
          <CardHeader
            title="Cleansed Data Preview"
            subtitle={has ? `Displaying ${cleanedRows.length} cleansed master records` : 'Run cleansing to auto-fix data issues'}
          >
            <div className="flex items-center gap-2">
              {has && (
                <Button variant="secondary" size="sm" icon={<Download className="w-3 h-3" />} onClick={() => dl(expCSV(cleanedRows), 'cleaned.csv', 'text/csv')}>
                  Export All CSV
                </Button>
              )}
              <button
                onClick={() => setOpenPreviewAccordion(!openPreviewAccordion)}
                className="p-1.5 rounded-lg hover:bg-[var(--bg-tertiary)] text-[var(--text-tertiary)] cursor-pointer transition-colors"
                title={openPreviewAccordion ? "Collapse Data Preview" : "Expand Data Preview"}
              >
                {openPreviewAccordion ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
            </div>
          </CardHeader>
          {openPreviewAccordion && (
            <CardBody>
              {has ? (() => {
                const allTables: TableInfo[] = extractedTables.length > 0
                  ? extractedTables
                  : [{ table_name: 'Cleansed Records', columns: Object.keys(cleanedRows[0] || {}) }];
                const visibleTables = allTables.filter((t: any) => selectedCleanseTables.has(t.table_name));
                const allKeyColumns = detectKeyColumns(allTables.flatMap((t: any) => t.columns));
                const filteredRows = filterRowsByKey(cleanedRows, cleanseKeyFilter, allKeyColumns);

                return (
                  <div className="space-y-4">
                    <TableFilterToolbar
                      tables={allTables}
                      selectedTables={selectedCleanseTables}
                      onSelectedTablesChange={setSelectedCleanseTables}
                      keyFilterValue={cleanseKeyFilter}
                      onKeyFilterChange={setCleanseKeyFilter}
                      keyColumns={allKeyColumns}
                      accentColor="violet"
                    />
                    {visibleTables.length === 0 ? (
                      <div className="p-8 text-center rounded-2xl border border-dashed border-gray-300 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/30 text-gray-500 dark:text-gray-400 text-xs font-medium">
                        No tables selected. Click <strong>Tables Selected</strong> above to choose tables to view.
                      </div>
                    ) : (
                      visibleTables.map((t: any) => {
                        const { columns: tableCols, rows: tableRows } = getTableDisplayData(t, filteredRows, state.mapping);
                        return (
                          <div key={t.table_name} className="rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] p-4 space-y-3 shadow-xs">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-[12px] text-[var(--text-primary)]">{t.table_name}</span>
                                <span className="text-[10px] text-[var(--text-tertiary)] font-mono">
                                  ({tableCols.length} columns · {tableRows.length} rows{cleanseKeyFilter ? ' filtered' : ''})
                                </span>
                              </div>
                              <Button
                                variant="secondary"
                                size="sm"
                                icon={<Download className="w-3 h-3" />}
                                onClick={() => dl(expCSV(tableRows), `${t.table_name.replace(/[\s/]+/g, '_').toLowerCase()}_cleansed.csv`, 'text/csv')}
                              >
                                Export {t.table_name}
                              </Button>
                            </div>
                            <DataTable rows={tableRows.slice(0, 15)} cols={tableCols} />
                            {tableRows.length > 15 && (
                              <div className="text-[10px] text-[var(--text-tertiary)] text-center py-1.5 border-t border-[var(--border)]">
                                Showing 15 of {tableRows.length} rows · Export CSV for full table
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                );
              })() : (
                <EmptyState icon={<Sparkles className="w-10 h-10 text-violet-500" />} message="Run cleansing to auto-fix data issues and view cleansed output" />
              )}
            </CardBody>
          )}
        </Card>

        {/* Status Notes */}
        <Card>
          <CardBody className="p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
            {has ? (
              <>
                <InfoBox variant="success">
                  <strong>✓ Auto-Fixed Standard Items:</strong><br />
                  Country codes & currencies normalized<br />
                  IDs padded to SAP 10-digit standard<br />
                  Whitespace trimmed & special chars cleaned
                </InfoBox>
                <InfoBox variant="warning">
                  <strong>⚠ Manual Review Guidance:</strong><br />
                  Review empty required fields<br />
                  Verify customer email formats & overlength strings
                </InfoBox>
              </>
            ) : (
              <InfoBox variant="info">Select rules on the left and click <strong>Auto-Fix with AI</strong> to cleanse data.</InfoBox>
            )}
          </CardBody>
        </Card>
      </div>

      {/* Batch Manual Fix Modal */}
      {showFixModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-md p-4" onClick={(e) => { if (e.target === e.currentTarget) setShowFixModal(false); }}>
          <div className="w-full max-w-3xl max-h-[90vh] bg-[var(--bg-primary)] rounded-2xl shadow-2xl border border-[var(--border)] flex flex-col overflow-hidden"
            style={{ boxShadow: '0 25px 60px rgba(0,0,0,0.35), 0 0 0 1px rgba(251,191,36,0.12)' }}>

            {/* ── Modal Header ── */}
            <div className="relative px-6 pt-6 pb-5 border-b border-[var(--border)] shrink-0"
              style={{ background: 'linear-gradient(135deg, rgba(251,191,36,0.18) 0%, rgba(245,158,11,0.12) 50%, rgba(120,53,15,0.06) 100%)', backgroundColor: 'var(--bg-secondary)' }}>
              {/* Decorative glow – pointer-events-none so it never clips content */}
              <div className="absolute inset-0 pointer-events-none rounded-t-2xl overflow-hidden">
                <div className="absolute top-0 right-0 w-56 h-full opacity-[0.05]"
                  style={{ background: 'radial-gradient(ellipse at top right, #f59e0b 0%, transparent 70%)' }} />
              </div>

              {/* Title row */}
              <div className="relative flex items-start justify-between gap-4">
                <div className="flex items-center gap-3.5">
                  {/* Icon badge */}
                  <div className="w-11 h-11 shrink-0 rounded-xl flex items-center justify-center"
                    style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)', boxShadow: '0 4px 14px rgba(245,158,11,0.4)' }}>
                    <span className="text-[18px] leading-none">⚠️</span>
                  </div>
                  <div>
                    <h3 className="font-bold text-[15px] text-[var(--text-primary)] leading-snug">Fix Warning Records</h3>
                    <p className="text-[11.5px] text-[var(--text-tertiary)] mt-0.5 leading-snug">Provide corrected values for each flagged field below</p>
                  </div>
                </div>

                {/* Badges + close */}
                <div className="flex items-center gap-2 shrink-0 pt-0.5">
                  <span className="px-2.5 py-1 rounded-lg text-[10.5px] font-bold bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800/50 whitespace-nowrap">
                    {warningList.length} {warningList.length === 1 ? 'warning' : 'warnings'}
                  </span>
                  <span className="px-2.5 py-1 rounded-lg text-[10.5px] font-bold bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/50 whitespace-nowrap">
                    {Object.values(manualFixValues).filter(v => v.trim() !== '').length} fixed
                  </span>
                  <button
                    onClick={() => setShowFixModal(false)}
                    className="ml-1 w-8 h-8 flex items-center justify-center rounded-xl text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] transition-all cursor-pointer border border-transparent hover:border-[var(--border)]"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Progress bar */}
              {warningList.length > 0 && (
                <div className="relative mt-4">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10px] text-[var(--text-tertiary)] font-medium">Completion progress</span>
                    <span className="text-[10px] font-bold text-[var(--text-secondary)]">
                      {Math.round((Object.values(manualFixValues).filter(v => v.trim() !== '').length / warningList.length) * 100)}%
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--bg-tertiary)' }}>
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${(Object.values(manualFixValues).filter(v => v.trim() !== '').length / warningList.length) * 100}%`,
                        background: 'linear-gradient(90deg, #10b981, #059669)'
                      }}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* ── Warning Cards List ── */}
            <div className="flex-1 overflow-y-auto p-5 space-y-3" style={{ background: 'var(--bg-secondary)' }}>
              {warningList.map((warning, i) => {
                const key = `${warning.row}::${warning.field}::${warning.rule_code}`;
                const val = manualFixValues[key] ?? "";
                const rowIndex = warning.row - 1;
                const currentVal = (cleanedRows[rowIndex] && cleanedRows[rowIndex][warning.field]) ?? '';
                const isFixed = val.trim() !== '';

                return (
                  <div
                    key={i}
                    className="rounded-xl border overflow-hidden transition-all duration-200"
                    style={{
                      borderColor: isFixed ? 'rgba(16,185,129,0.4)' : 'var(--border)',
                      background: 'var(--bg-primary)',
                      boxShadow: isFixed ? '0 0 0 1px rgba(16,185,129,0.15), 0 2px 8px rgba(0,0,0,0.06)' : '0 2px 8px rgba(0,0,0,0.04)'
                    }}
                  >
                    {/* Card Top Bar */}
                    <div className="flex items-center justify-between px-4 py-2.5 border-b"
                      style={{
                        borderColor: isFixed ? 'rgba(16,185,129,0.2)' : 'var(--border)',
                        background: isFixed
                          ? 'linear-gradient(90deg, rgba(16,185,129,0.06), rgba(5,150,105,0.03))'
                          : 'linear-gradient(90deg, rgba(251,191,36,0.06), rgba(245,158,11,0.02))'
                      }}>
                      <div className="flex items-center gap-2.5">
                        <div className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-black shrink-0"
                          style={{
                            background: isFixed ? '#10b981' : '#f59e0b',
                            color: 'white',
                            boxShadow: isFixed ? '0 2px 6px rgba(16,185,129,0.4)' : '0 2px 6px rgba(245,158,11,0.4)'
                          }}>
                          {isFixed ? '✓' : i + 1}
                        </div>
                        <code className="text-[11px] font-bold tracking-wide"
                          style={{ color: isFixed ? '#10b981' : '#f59e0b' }}>
                          {warning.rule_code}
                        </code>
                        <span className="hidden sm:inline text-[var(--text-tertiary)] text-[10px]">·</span>
                        <span className="hidden sm:inline text-[10px] font-mono text-[var(--text-tertiary)]">
                          Field: <strong className="text-[var(--text-secondary)]">{warning.field}</strong>
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        {isFixed && (
                          <span className="text-[9.5px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300">
                            Fixed ✓
                          </span>
                        )}
                        <span className="text-[10px] px-2 py-0.5 rounded-lg border text-[var(--text-secondary)] font-semibold"
                          style={{ borderColor: 'var(--border)', background: 'var(--bg-tertiary)' }}>
                          Row #{warning.row}
                        </span>
                      </div>
                    </div>

                    {/* Card Body */}
                    <div className="flex flex-col sm:flex-row">
                      {/* Left: Info Panel */}
                      <div className="flex-1 p-4 space-y-3 border-b sm:border-b-0 sm:border-r" style={{ borderColor: 'var(--border)' }}>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="rounded-lg p-2.5" style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border)' }}>
                            <div className="text-[9px] uppercase tracking-widest font-bold text-[var(--text-tertiary)] mb-1">Field</div>
                            <div className="text-[11.5px] font-mono font-bold text-[var(--text-primary)] truncate">{warning.field || '—'}</div>
                          </div>
                          <div className="rounded-lg p-2.5" style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border)' }}>
                            <div className="text-[9px] uppercase tracking-widest font-bold text-[var(--text-tertiary)] mb-1">Current Value</div>
                            <div className={`text-[11.5px] font-mono font-semibold truncate ${!currentVal ? 'italic opacity-40' : 'text-[var(--text-primary)]'}`}>
                              {currentVal || '(empty)'}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg text-[11px] leading-snug"
                          style={{
                            background: 'rgba(251,191,36,0.08)',
                            border: '1px solid rgba(251,191,36,0.2)',
                            color: 'var(--color-warning, #f59e0b)'
                          }}>
                          <span className="shrink-0 text-[13px] mt-0.5">⚠</span>
                          <span className="text-[var(--text-secondary)]">{warning.reason || warning.message || 'No description provided.'}</span>
                        </div>
                      </div>

                      {/* Right: Input Panel */}
                      <div className="w-full sm:w-[42%] p-4 flex flex-col justify-center gap-2" style={{ background: 'var(--bg-primary)' }}>
                        <label className="text-[11px] font-bold text-[var(--text-secondary)] uppercase tracking-wider">
                          Correct Value
                        </label>
                        <input
                          type="text"
                          value={val}
                          onChange={(e) => setManualFixValues(prev => ({ ...prev, [key]: e.target.value }))}
                          className="w-full h-11 px-4 text-[13px] font-medium rounded-xl outline-none transition-all duration-200 placeholder:text-[var(--text-tertiary)]"
                          style={{
                            background: 'var(--bg-tertiary)',
                            border: `1.5px solid ${isFixed ? '#10b981' : 'var(--border)'}`,
                            color: 'var(--text-primary)',
                            boxShadow: isFixed ? '0 0 0 3px rgba(16,185,129,0.12)' : 'none'
                          }}
                          onFocus={(e) => {
                            e.currentTarget.style.border = `1.5px solid ${isFixed ? '#10b981' : '#8b5cf6'}`;
                            e.currentTarget.style.boxShadow = isFixed ? '0 0 0 3px rgba(16,185,129,0.15)' : '0 0 0 3px rgba(139,92,246,0.15)';
                          }}
                          onBlur={(e) => {
                            e.currentTarget.style.border = `1.5px solid ${isFixed ? '#10b981' : 'var(--border)'}`;
                            e.currentTarget.style.boxShadow = isFixed ? '0 0 0 3px rgba(16,185,129,0.12)' : 'none';
                          }}
                          placeholder="Enter the correct value…"
                        />
                        {isFixed && (
                          <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1">
                            <Check className="w-3 h-3" /> Value ready to save
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
              {warningList.length === 0 && (
                <div className="flex flex-col items-center justify-center py-14 gap-3 text-center">
                  <div className="w-14 h-14 rounded-2xl flex items-center justify-center bg-emerald-100 dark:bg-emerald-900/30">
                    <Check className="w-7 h-7 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <div className="text-[13px] font-semibold text-[var(--text-primary)]">No warnings to fix</div>
                  <div className="text-[11.5px] text-[var(--text-tertiary)]">All records are clean — no manual intervention required.</div>
                </div>
              )}
            </div>

            {/* ── Modal Footer ── */}
            <div className="px-6 py-4 border-t border-[var(--border)] flex items-center justify-between gap-3"
              style={{ background: 'var(--bg-secondary)' }}>
              <div className="text-[11px] text-[var(--text-tertiary)]">
                {Object.values(manualFixValues).filter(v => v.trim() !== '').length > 0 ? (
                  <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                    {Object.values(manualFixValues).filter(v => v.trim() !== '').length} of {warningList.length} values entered
                  </span>
                ) : (
                  <span>Enter values in the fields above to enable save</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowFixModal(false)}
                  className="px-4 py-2 rounded-xl text-[12px] font-semibold border transition-all cursor-pointer hover:bg-[var(--bg-tertiary)]"
                  style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
                >
                  Cancel
                </button>
                <button
                  onClick={applyManualFixes}
                  disabled={warningList.length === 0 || Object.values(manualFixValues).every(v => v.trim() === "")}
                  className="px-5 py-2 rounded-xl text-[12px] font-bold text-white flex items-center gap-2 transition-all duration-200 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{
                    background: 'linear-gradient(135deg, #10b981, #059669)',
                    boxShadow: '0 4px 14px rgba(16,185,129,0.35)'
                  }}
                >
                  <Save className="w-3.5 h-3.5" />
                  Save {Object.values(manualFixValues).filter(v => v.trim() !== '').length > 0 ? `${Object.values(manualFixValues).filter(v => v.trim() !== '').length} Fix${Object.values(manualFixValues).filter(v => v.trim() !== '').length > 1 ? 'es' : ''}` : 'Fixes'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </PageLayout>
  );
}
