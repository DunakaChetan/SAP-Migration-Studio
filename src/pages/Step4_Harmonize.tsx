import React, { useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useToast } from '@/components/ui/toast';
import { useLoading } from '@/components/ui/loading-overlay';
import { dl } from '@/lib/utils';
import {
  PageLayout, PageGrid, GridCol, Card, CardHeader, CardBody, Button,
  StatBox, StatsGrid, DataTable, PageHeader, EmptyState
} from '@/components/shared';
import {
  FlaskConical, Upload, FileSpreadsheet, MapPin, Download,
  Play, Trash2, CheckCircle2, AlertCircle, FileText, ArrowLeft, ArrowRight, Save, Database
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useMigration } from '@/store/migration-store';

/* ─── Types ─── */
interface DroppedFile {
  file: File;
  name: string;
  size: string;
  rows?: number;
}

interface HarmonizationStats {
  total_input: number;
  total_output: number;
  primary_rows?: number;
  secondary_rows?: number;
  deduped?: number;
  empty_removed?: number;
  columns?: number;
  [key: string]: number | undefined;
}

interface HarmonizationResult {
  stats: HarmonizationStats;
  fix_log: string[];
  final_table: Record<string, any>[];
  columns: string[];
  session_id?: string;
}

/* ─── Drop Zone Component ─── */
function DropZone({
  id,
  label,
  subtitle,
  icon: Icon,
  accept,
  file,
  onDrop,
  onClear,
  disabled = false,
  accentColor = 'primary',
}: {
  id: string;
  label: string;
  subtitle: string;
  icon: React.ElementType;
  accept: string;
  file: DroppedFile | null;
  onDrop: (f: File) => void;
  onClear: () => void;
  disabled?: boolean;
  accentColor?: string;
}) {
  const [isDragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (disabled) return;
    if (e.type === 'dragenter' || e.type === 'dragover') setDragOver(true);
    else if (e.type === 'dragleave') setDragOver(false);
  }, [disabled]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    if (disabled) return;
    const files = e.dataTransfer.files;
    if (files?.[0]) onDrop(files[0]);
  }, [disabled, onDrop]);

  const handleClick = () => {
    if (!disabled && inputRef.current) inputRef.current.click();
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) onDrop(e.target.files[0]);
  };

  const colorMap: Record<string, { border: string; bg: string; text: string; glow: string }> = {
    primary: {
      border: 'border-primary-400 dark:border-primary-500',
      bg: 'bg-primary-50/50 dark:bg-primary-900/20',
      text: 'text-primary-600 dark:text-primary-400',
      glow: 'shadow-[0_0_20px_rgba(37,99,235,0.15)]',
    },
    teal: {
      border: 'border-teal-400 dark:border-teal-500',
      bg: 'bg-teal-50/50 dark:bg-teal-900/20',
      text: 'text-teal-600 dark:text-teal-400',
      glow: 'shadow-[0_0_20px_rgba(20,184,166,0.15)]',
    },
    violet: {
      border: 'border-violet-400 dark:border-violet-500',
      bg: 'bg-violet-50/50 dark:bg-violet-900/20',
      text: 'text-violet-600 dark:text-violet-400',
      glow: 'shadow-[0_0_20px_rgba(124,58,237,0.15)]',
    },
    amber: {
      border: 'border-amber-400 dark:border-amber-500',
      bg: 'bg-amber-50/50 dark:bg-amber-900/20',
      text: 'text-amber-600 dark:text-amber-400',
      glow: 'shadow-[0_0_20px_rgba(245,158,11,0.15)]',
    },
  };
  const colors = colorMap[accentColor] || colorMap.primary;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <div
        id={id}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        onClick={handleClick}
        className={`
          relative rounded-xl border-2 border-dashed p-5 transition-all duration-300 cursor-pointer
          ${disabled
            ? 'opacity-40 pointer-events-none border-[var(--border)] bg-[var(--bg-tertiary)]/30'
            : file
              ? `border-emerald-400 dark:border-emerald-500 bg-emerald-50/30 dark:bg-emerald-900/10`
              : isDragOver
                ? `${colors.border} ${colors.bg} ${colors.glow} scale-[1.01]`
                : 'border-[var(--border)] bg-[var(--bg-tertiary)]/30 hover:border-[var(--text-tertiary)] hover:bg-[var(--bg-tertiary)]/60'
          }
        `}
      >
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          onChange={handleChange}
          className="hidden"
        />

        <AnimatePresence mode="wait">
          {file ? (
            <motion.div
              key="file-info"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="flex items-center gap-3"
            >
              <div className="w-10 h-10 rounded-lg bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[12px] font-semibold text-[var(--text-primary)] truncate">
                  {file.name}
                </div>
                <div className="text-[10px] text-[var(--text-tertiary)]">
                  {file.size}{file.rows ? ` · ${file.rows} rows` : ''}
                </div>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); onClear(); }}
                className="p-1.5 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/30 text-[var(--text-tertiary)] hover:text-red-500 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </motion.div>
          ) : (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center gap-2 text-center"
            >
              <div className={`w-10 h-10 rounded-lg bg-[var(--bg-tertiary)] flex items-center justify-center ${isDragOver ? colors.text : 'text-[var(--text-tertiary)]'}`}>
                <Icon className="w-5 h-5" />
              </div>
              <div>
                <div className={`text-[12px] font-semibold ${isDragOver ? colors.text : 'text-[var(--text-secondary)]'}`}>
                  {label}
                </div>
                <div className="text-[10px] text-[var(--text-tertiary)] mt-0.5">{subtitle}</div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}


/* ─── Source Options ─── */
const SOURCE_OPTIONS = [
  { value: 'SAP_ECC', label: 'SAP ECC 6.0' },
  { value: 'ORACLE_EBS', label: 'Oracle EBS R12' },
  { value: 'EXCEL_CSV', label: 'Excel / CSV' },
  { value: 'DYNAMICS', label: 'MS Dynamics 365' },
  { value: 'SALESFORCE', label: 'Salesforce CRM' },
  { value: 'LEGACY', label: 'Legacy DB' },
];

/* ─── Harmonization Audit & Summary Report Component ─── */
function HarmonizationReportCard({ result }: { result: HarmonizationResult }) {
  const [showLogDetails, setShowLogDetails] = useState(false);

  const fixLog = result.fix_log || [];
  const stats = result.stats || {};
  const rows = result.final_table || [];
  const cols = result.columns || [];

  // Source breakdown from final_table
  const sourceCounts: Record<string, number> = {};
  rows.forEach((r) => {
    const src = String(r.SOURCE || 'UNKNOWN');
    sourceCounts[src] = (sourceCounts[src] || 0) + 1;
  });

  // Extract secondary new columns from fix_log if present
  let newSecondaryCols: string[] = [];
  fixLog.forEach((log) => {
    if (log.includes('[Merge] New columns from secondary:')) {
      try {
        const match = log.match(/\[Merge\] New columns from secondary:\s*(\[.*\])/);
        if (match) {
          newSecondaryCols = JSON.parse(match[1].replace(/'/g, '"'));
        }
      } catch { /* ignore */ }
    }
  });

  // Group log items by category
  const categories = [
    {
      title: 'Dedup & Filtering',
      icon: '🗑️',
      items: fixLog.filter((l) => l.includes('[Dedup]') || l.includes('[EmptyFilter]') || l.includes('[HeaderCleanup]')),
    },
    {
      title: 'Country, Currency & Code Conversions',
      icon: '🌍',
      items: fixLog.filter((l) =>
        l.includes('[Country→ISO]') ||
        l.includes('[Currency→ISO]') ||
        l.includes('[PayTerms→SAP]') ||
        l.includes('[MatType→SAP]') ||
        l.includes('[UOM→SAP]')
      ),
    },
    {
      title: 'Date & Phone Formatting',
      icon: '📅',
      items: fixLog.filter((l) => l.includes('[Date→YYYYMMDD]') || l.includes('[PhoneClean]')),
    },
    {
      title: 'Text & Field Length Adjustments',
      icon: '✂️',
      items: fixLog.filter((l) => l.includes('[WhitespaceTrim]') || l.includes('[Trunc35]') || l.includes('[UPPER]') || l.includes('[Pad10]') || l.includes('[Trim]') || l.includes('[Transform:')),
    },
  ];

  const totalFixEvents = fixLog.filter(
    (l) => l.startsWith('[') && !l.includes('[Init]') && !l.includes('[ColumnNaming]')
  ).length;

  return (
    <Card className="mt-4 border-violet-200 dark:border-violet-900/40 bg-gradient-to-br from-[var(--bg-primary)] via-[var(--bg-secondary)] to-violet-50/20 dark:to-violet-950/10 shadow-sm">
      <CardHeader
        title="Harmonization Changes & Audit Report"
        subtitle="Comprehensive summary of transformations, column additions, and source origins"
      />
      <CardBody className="p-4 space-y-4">
        {/* Metric Cards Grid */}
        <div className="grid grid-cols-4 gap-3">
          <div className="p-3 rounded-xl border border-[var(--border)] bg-[var(--bg-tertiary)]/50">
            <div className="text-[10px] font-bold text-[var(--text-tertiary)] uppercase tracking-wider">Rows Preserved</div>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="text-xl font-extrabold text-[var(--text-primary)]">{stats.total_output || rows.length}</span>
              <span className="text-[10px] text-[var(--text-tertiary)]">/ {stats.total_input || 0} input</span>
            </div>
            <div className="mt-1 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
              {(stats.deduped || 0) + (stats.empty_removed || 0) > 0
                ? `Cleaned ${(stats.deduped || 0) + (stats.empty_removed || 0)} invalid/dup rows`
                : 'All input records preserved'}
            </div>
          </div>

          <div className="p-3 rounded-xl border border-[var(--border)] bg-[var(--bg-tertiary)]/50">
            <div className="text-[10px] font-bold text-[var(--text-tertiary)] uppercase tracking-wider">Output Columns</div>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="text-xl font-extrabold text-[var(--text-primary)]">{cols.length}</span>
              <span className="text-[10px] text-[var(--text-tertiary)]">total fields</span>
            </div>
            <div className="mt-1 text-[10px] font-semibold text-violet-600 dark:text-violet-400">
              Includes SOURCE tag & SAP schema
            </div>
          </div>

          <div className="p-3 rounded-xl border border-[var(--border)] bg-[var(--bg-tertiary)]/50">
            <div className="text-[10px] font-bold text-[var(--text-tertiary)] uppercase tracking-wider">Rule Transformations</div>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="text-xl font-extrabold text-violet-600 dark:text-violet-400">{totalFixEvents}</span>
              <span className="text-[10px] text-[var(--text-tertiary)]">field fixes</span>
            </div>
            <div className="mt-1 text-[10px] font-semibold text-[var(--text-tertiary)]">
              Evaluated across 11 auto-rules
            </div>
          </div>

          <div className="p-3 rounded-xl border border-[var(--border)] bg-[var(--bg-tertiary)]/50">
            <div className="text-[10px] font-bold text-[var(--text-tertiary)] uppercase tracking-wider">Source Systems</div>
            <div className="mt-1.5 flex flex-wrap gap-1">
              {Object.entries(sourceCounts).map(([src, count]) => (
                <span key={src} className="px-2 py-0.5 rounded-md bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 font-mono font-bold text-[10px]">
                  {src}: {count}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* What was added into the final output table */}
        <div className="p-3.5 rounded-xl border border-[var(--border)] bg-[var(--bg-tertiary)]/30 space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-[11.5px] font-bold text-[var(--text-primary)]">
              Final Output Table Structure & Added Columns
            </div>
            <div className="text-[10px] text-[var(--text-tertiary)]">
              {cols.length} total columns generated
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5 pt-1">
            {cols.map((col) => {
              const isSource = col === 'SOURCE';
              const isSecondary = newSecondaryCols.includes(col);
              return (
                <span
                  key={col}
                  className={`px-2.5 py-1 rounded-lg text-[10.5px] font-mono font-bold border transition-all ${
                    isSource
                      ? 'bg-amber-50 dark:bg-amber-900/25 border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-300 shadow-sm'
                      : isSecondary
                      ? 'bg-teal-50 dark:bg-teal-900/25 border-teal-300 dark:border-teal-700 text-teal-700 dark:text-teal-300 shadow-sm'
                      : 'bg-[var(--bg-tertiary)] border-[var(--border)] text-[var(--text-secondary)]'
                  }`}
                >
                  {col}
                  {isSource && ' 🏷️ (Source System Tag)'}
                  {isSecondary && ' ➕ (Secondary Column)'}
                </span>
              );
            })}
          </div>
        </div>

        {/* Transformation Categories Grid */}
        <div className="space-y-2">
          <div className="text-[11.5px] font-bold text-[var(--text-primary)]">
            Harmonization Transformation Breakdown
          </div>
          <div className="grid grid-cols-2 gap-3">
            {categories.map((cat, i) => (
              <div key={i} className="p-3 rounded-xl border border-[var(--border)] bg-[var(--bg-tertiary)]/40 space-y-1.5">
                <div className="flex items-center justify-between text-[11px] font-bold text-[var(--text-primary)]">
                  <span className="flex items-center gap-1.5">
                    <span>{cat.icon}</span>
                    <span>{cat.title}</span>
                  </span>
                  <span className="px-1.5 py-0.5 rounded bg-[var(--bg-tertiary)] text-[9.5px] font-bold text-violet-600 dark:text-violet-400 border border-[var(--border)]">
                    {cat.items.length} events
                  </span>
                </div>
                {cat.items.length > 0 ? (
                  <div className="space-y-1 max-h-[100px] overflow-y-auto scrollbar-thin scrollbar-thumb-[var(--border)] scrollbar-track-transparent pr-1">
                    {cat.items.map((item, idx) => (
                      <div key={idx} className="text-[10px] text-[var(--text-secondary)] font-mono truncate bg-[var(--bg-primary)]/50 px-2 py-0.5 rounded">
                        {item}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-[10px] text-[var(--text-tertiary)] italic px-1 py-0.5">No changes required for this category</div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Expandable Full Audit Log */}
        <div className="pt-2 border-t border-[var(--border)] flex items-center justify-between">
          <button
            onClick={() => setShowLogDetails(!showLogDetails)}
            className="text-[11px] font-bold text-violet-600 dark:text-violet-400 hover:underline flex items-center gap-1 cursor-pointer"
          >
            {showLogDetails ? '▼ Hide Complete Audit Trail' : '▶ View Complete Audit Trail'} ({fixLog.length} log entries)
          </button>
        </div>

        {showLogDetails && (
          <div className="p-3 rounded-xl border border-[var(--border)] bg-[var(--bg-tertiary)] max-h-[250px] overflow-y-auto font-mono text-[10px] space-y-1 scrollbar-thin">
            {fixLog.map((log, idx) => (
              <div key={idx} className="text-[var(--text-secondary)]">
                {log}
              </div>
            ))}
          </div>
        )}
      </CardBody>
    </Card>
  );
}

/* ─── Main Page ─── */
export function Step4Harmonize() {
  const { toast } = useToast();
  const { showLoad, tick, hideLoad } = useLoading();
  const navigate = useNavigate();
  const { state, dispatch } = useMigration();

  // State
  const [mode, setMode] = useState<'flow' | 'single' | 'multi'>('flow');
  const [sapObject, setSapObject] = useState(state.obj || 'CUSTOMER');
  const [companyCode, setCompanyCode] = useState(state.cc || '1000');
  const [plant, setPlant] = useState(state.plant || '1000');
  const [currency, setCurrency] = useState(state.curr || 'INR');
  const [salesOrg, setSalesOrg] = useState(state.so || '1000');
  const [purchOrg, setPurchOrg] = useState(state.po || '1000');
  const [distChannel, setDistChannel] = useState(state.distch || '10');
  const [division, setDivision] = useState(state.spart || '00');

  // Source Systems
  const [primarySource, setPrimarySource] = useState(state.src || 'SAP_ECC');
  const [secondarySource, setSecondarySource] = useState('ORACLE_EBS');

  // Files
  const [primaryFile, setPrimaryFile] = useState<DroppedFile | null>(null);
  const [secondaryFile, setSecondaryFile] = useState<DroppedFile | null>(null);
  const [primaryMappingFile, setPrimaryMappingFile] = useState<DroppedFile | null>(null);
  const [secondaryMappingFile, setSecondaryMappingFile] = useState<DroppedFile | null>(null);

  // Results
  const result: HarmonizationResult | null = state.harmonizationResult;
  const setResult = (val: any) => dispatch({ type: 'SET_FIELD', field: 'harmonizationResult', value: val });

  const saveDataToDB = async () => {
    if (!state.projectId) {
      toast('No project ID found. Please create a project first.', 'err');
      return;
    }
    if (!result?.final_table) return;
    
    showLoad('Saving data...', 'Persisting harmonized records to database');
    try {
      const res = await fetch(`${import.meta.env.VITE_BACKEND_URL}/api/sap/harmonize/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: state.projectId,
          target_object: state.obj,
          payload: result.final_table
        })
      });
      
      if (!res.ok) throw new Error('Failed to save data');
      
      hideLoad();
      dispatch({ type: 'SET_FIELD', field: 'isHarmonizedSaved', value: true });
      toast('Harmonized data saved to database successfully!', 'ok');
    } catch (err: any) {
      hideLoad();
      toast(err.message || 'Failed to save data', 'err');
    }
  };

  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleFileDrop = (
    setter: React.Dispatch<React.SetStateAction<DroppedFile | null>>
  ) => async (file: File) => {
    const dropped: DroppedFile = {
      file,
      name: file.name,
      size: formatSize(file.size),
    };

    // Try to count rows for CSV
    if (file.name.endsWith('.csv')) {
      try {
        const text = await file.text();
        const lines = text.split('\n').filter(l => l.trim());
        dropped.rows = Math.max(0, lines.length - 1); // exclude header
      } catch { /* ignore */ }
    }

    setter(dropped);
  };

  const canRun = mode === 'flow' 
    ? true
    : mode === 'single'
      ? !!primaryFile
      : !!(secondaryFile && secondaryMappingFile);

  async function runHarmonization() {
    if (!canRun) return;
    if (mode === 'single' && !primaryFile) return;
    dispatch({ type: 'SET_FIELD', field: 'isHarmonizedSaved', value: false });

    showLoad('Running Harmonization Agent…', 'Processing your data through 11 rules', [
      'Reading files from Database or Uploads…',
      'Applying field mappings…',
      'Rules 1-2: Dedup & Empty filter…',
      'Rules 3-6: Country, Currency, PayTerms, MatType…',
      'Rule 7: Whitespace Trim…',
      'Rules 8-9: Date format & Phone cleanup…',
      'Rules 10-11: UOM normalize & Text truncate…',
      'Generating results with Source tracking…',
    ]);
    [0, 1, 2, 3, 4, 5, 6, 7].forEach(i => setTimeout(() => tick(i), 300 + i * 300));

    try {
      let res;
      if (mode === 'flow') {
        if (!state.projectId) {
          throw new Error("No Project ID found. Please extract and save data in Step 3 first.");
        }
        res = await fetch(`${import.meta.env.VITE_BACKEND_URL}/api/sap/harmonize/flow`, { 
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            project_id: state.projectId,
            sap_object: sapObject,
            company_code: companyCode,
            sales_org: salesOrg,
            purch_org: purchOrg,
            plant: plant,
            dist_channel: distChannel,
            division: division,
            currency: currency,
            primary_source: state.src || primarySource,
          })
        });
      } else if (mode === 'multi') {
        if (!state.projectId) {
          throw new Error("No Project ID found. Please extract and save data in Step 3 first.");
        }
        const formData = new FormData();
        formData.append('project_id', state.projectId);
        formData.append('sap_object', sapObject);
        formData.append('company_code', companyCode);
        formData.append('sales_org', salesOrg);
        formData.append('purch_org', purchOrg);
        formData.append('plant', plant);
        formData.append('dist_channel', distChannel);
        formData.append('division', division);
        formData.append('currency', currency);
        formData.append('primary_source', state.src || primarySource);
        formData.append('secondary_source', secondarySource);
        formData.append('secondary_file', secondaryFile!.file);
        formData.append('secondary_mapping_file', secondaryMappingFile!.file);

        res = await fetch(`${import.meta.env.VITE_BACKEND_URL}/api/sap/harmonize/multi-flow`, { method: 'POST', body: formData });
      } else {
        // single mode
        const formData = new FormData();
        formData.append('mode', 'single');
        formData.append('sap_object', sapObject);
        formData.append('company_code', companyCode);
        formData.append('sales_org', salesOrg);
        formData.append('purch_org', purchOrg);
        formData.append('plant', plant);
        formData.append('dist_channel', distChannel);
        formData.append('division', division);
        formData.append('currency', currency);
        formData.append('primary_source', primarySource);
        formData.append('primary_file', primaryFile!.file);

        if (primaryMappingFile) formData.append('primary_mapping_file', primaryMappingFile.file);

        res = await fetch(`${import.meta.env.VITE_BACKEND_URL}/api/sap/harmonize`, { method: 'POST', body: formData });
      }

      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: 'Unknown error' }));
        throw new Error(err.detail || 'Harmonization failed');
      }

      const data = await res.json();

      setTimeout(() => {
        tick(8, 'Complete');
        setTimeout(() => {
          hideLoad();
          setResult(data);
          toast(
            `Harmonized: ${data.stats.total_output} rows from ${data.stats.total_input} input rows`,
            'ok'
          );
        }, 600);
      }, 500);

    } catch (err: any) {
      hideLoad();
      toast(err.message || 'Harmonization failed', 'err');
    }
  }

  function downloadResult() {
    if (!result?.session_id) return;
    window.open(`/api/sap/harmonize/download/${result.session_id}`, '_blank');
  }

  return (
    <PageLayout>
      <PageGrid>

        {/* ─── Main Column: Drop Zones + Results ─── */}
        <GridCol span={9}>
          <div className="space-y-4">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-[var(--text-primary)]">Step 4 — Harmonization Agent</h1>
              <p className="mt-1 max-w-2xl text-sm text-[var(--text-secondary)]">Upload files, configure parameters, and test the harmonization pipeline</p>
            </div>

            {/* Three mode options below subtitle */}
            <div className="flex items-center gap-2">
              {(['flow', 'single', 'multi'] as const).map(m => (
                <button
                  key={m}
                  onClick={() => { setMode(m); setResult(null); }}
                  className={`
                    px-3.5 py-1.5 rounded-lg text-[11.5px] font-semibold transition-all duration-200 border
                    ${mode === m
                      ? 'bg-violet-600 text-white border-violet-600 shadow-md shadow-violet-600/20'
                      : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] border-[var(--border)] hover:border-violet-300'}
                  `}
                >
                  {m === 'flow' ? '⚡ Flow' : m === 'single' ? '📄 Single' : '🔗 Multi'}
                </button>
              ))}
            </div>

            {/* Action Buttons: Back, Run Harmonization, Save Data, Next: Validation */}
            <div className="flex flex-wrap items-center gap-2 border-t border-[var(--border)] pt-3">
              <Button variant="secondary" icon={<ArrowLeft className="w-3.5 h-3.5" />} onClick={() => navigate('/extract')}>
                Back
              </Button>
              <Button
                variant="primary"
                icon={<Play className="w-3.5 h-3.5" />}
                onClick={runHarmonization}
                disabled={!canRun}
              >
                Run Harmonization
              </Button>
              <div title={!result ? "Run harmonization first before saving." : ""}>
                <Button variant="secondary" icon={<Save className="w-3.5 h-3.5" />} onClick={saveDataToDB} disabled={!result}>Save Data</Button>
              </div>
              <div title={!state.isHarmonizedSaved ? "You must save your data before proceeding to Step 5." : ""}>
                <Button
                  variant="primary"
                  icon={<ArrowRight className="w-3.5 h-3.5" />}
                  onClick={() => navigate('/validate')}
                  disabled={!state.isHarmonizedSaved}
                >
                  Next: Validation
                </Button>
              </div>
            </div>
          </div>

          {/* Drop Zones / DB Fetch */}
          {mode === 'single' && (
            <Card>
              <CardHeader
                title="Upload Files (Single-Source)"
                subtitle="Data file + optional Mapping CSV"
              />
              <CardBody className="p-4">
                {/* Primary Data Source Selector */}
                <div className="mb-3 px-3 py-2.5 rounded-xl border border-violet-300 dark:border-violet-600 bg-violet-50/40 dark:bg-violet-900/15">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-[11.5px] font-semibold text-violet-800 dark:text-violet-300">Data Source System</div>
                      <div className="text-[10px] text-violet-600/80 dark:text-violet-400/80">Select system origin for your data file</div>
                    </div>
                    <select
                      value={primarySource}
                      onChange={(e) => setPrimarySource(e.target.value)}
                      className="px-3 py-1.5 rounded-lg text-[11.5px] font-bold bg-[var(--bg-primary)] border border-violet-400 dark:border-violet-500 text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-violet-500 cursor-pointer shadow-sm"
                    >
                      {SOURCE_OPTIONS.map((s) => (
                        <option key={s.value} value={s.value}>{s.label} ({s.value})</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <DropZone
                    id="drop-primary"
                    label="Data File"
                    subtitle="Drag & drop CSV or Excel"
                    icon={FileSpreadsheet}
                    accept=".csv,.xlsx,.xls"
                    file={primaryFile}
                    onDrop={handleFileDrop(setPrimaryFile)}
                    onClear={() => setPrimaryFile(null)}
                    accentColor="primary"
                  />

                  <DropZone
                    id="drop-primary-mapping"
                    label="Mapping CSV (Optional)"
                    subtitle="Columns: src, sap, transform, confidence"
                    icon={MapPin}
                    accept=".csv"
                    file={primaryMappingFile}
                    onDrop={handleFileDrop(setPrimaryMappingFile)}
                    onClear={() => setPrimaryMappingFile(null)}
                    accentColor="violet"
                  />
                </div>

                <div className="mt-3 px-3 py-2 rounded-lg bg-[var(--bg-tertiary)]/50 border border-[var(--border)]">
                  <div className="text-[10px] text-[var(--text-tertiary)]">
                    <strong>Single mode:</strong> Upload your data file. If a Mapping CSV is provided, fields will be mapped and output headers will use short SAP target field names (after the dot, e.g. <code>KUNNR</code>, <code>NAME1</code>, <code>LAND1</code>).
                  </div>
                </div>
              </CardBody>
            </Card>
          )}

          {mode === 'multi' && (
            <Card>
              <CardHeader
                title="Multi-Source Harmonization"
                subtitle="Primary data from database + secondary data uploaded"
              />
              <CardBody className="p-4">
                {/* Primary data from DB indicator */}
                <div className="mb-3 px-3 py-2.5 rounded-xl border border-emerald-300 dark:border-emerald-600 bg-emerald-50/50 dark:bg-emerald-900/20">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center">
                      <Database className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    </div>
                    <div>
                      <div className="text-[11.5px] font-semibold text-emerald-700 dark:text-emerald-300">Primary Data: From Database ({state.src || 'SAP_ECC'})</div>
                      <div className="text-[10px] text-emerald-600/70 dark:text-emerald-400/70">
                        Using extracted data & mappings from Step 3 {state.extracted.length > 0 ? `(${state.extracted.length} rows)` : ''}
                      </div>
                    </div>
                    {state.isDataSaved && <CheckCircle2 className="w-4 h-4 text-emerald-500 ml-auto" />}
                  </div>
                </div>

                {/* Secondary Data Source Selector */}
                <div className="mb-3 px-3 py-2.5 rounded-xl border border-teal-300 dark:border-teal-600 bg-teal-50/40 dark:bg-teal-900/15">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-[11.5px] font-semibold text-teal-800 dark:text-teal-300">Secondary Data Source System</div>
                      <div className="text-[10px] text-teal-600/80 dark:text-teal-400/80">Select system origin for secondary file</div>
                    </div>
                    <select
                      value={secondarySource}
                      onChange={(e) => setSecondarySource(e.target.value)}
                      className="px-3 py-1.5 rounded-lg text-[11.5px] font-bold bg-[var(--bg-primary)] border border-teal-400 dark:border-teal-500 text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-teal-500 cursor-pointer shadow-sm"
                    >
                      {SOURCE_OPTIONS.map((s) => (
                        <option key={s.value} value={s.value}>{s.label} ({s.value})</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Secondary file uploads */}
                <div className="grid grid-cols-2 gap-3">
                  <DropZone
                    id="drop-secondary"
                    label="Secondary Data File"
                    subtitle="Drag & drop CSV or Excel"
                    icon={FileSpreadsheet}
                    accept=".csv,.xlsx,.xls"
                    file={secondaryFile}
                    onDrop={handleFileDrop(setSecondaryFile)}
                    onClear={() => setSecondaryFile(null)}
                    accentColor="teal"
                  />

                  <DropZone
                    id="drop-secondary-mapping"
                    label="Secondary Mapping CSV"
                    subtitle="Columns: src, sap, transform, confidence"
                    icon={MapPin}
                    accept=".csv"
                    file={secondaryMappingFile}
                    onDrop={handleFileDrop(setSecondaryMappingFile)}
                    onClear={() => setSecondaryMappingFile(null)}
                    accentColor="amber"
                  />
                </div>

                <div className="mt-3 px-3 py-2 rounded-lg bg-[var(--bg-tertiary)]/50 border border-[var(--border)]">
                  <div className="text-[10px] text-[var(--text-tertiary)]">
                    <strong>Multi mode:</strong> Primary data & mappings are loaded from your Step 3 extract. Upload a secondary data file and its mapping CSV to merge.
                  </div>
                </div>
              </CardBody>
            </Card>
          )}

          {/* Results Table */}
          {result && (
            <Card>
              <CardHeader
                title="Harmonized Output"
                subtitle={`${result.stats.total_output} rows × ${result.columns.length} columns`}
              >
                <Button
                  variant="secondary"
                  size="sm"
                  icon={<Download className="w-3 h-3" />}
                  onClick={downloadResult}
                  className="ml-auto"
                >
                  Export CSV
                </Button>
              </CardHeader>
              <CardBody>
                <DataTable
                  rows={result.final_table.slice(0, 15)}
                  cols={result.columns}
                />
                {result.final_table.length > 15 && (
                  <div className="text-[10px] text-[var(--text-tertiary)] text-center py-2 border-t border-[var(--border)]">
                    Showing 15 of {result.final_table.length} rows · Download CSV for full data
                  </div>
                )}
              </CardBody>
            </Card>
          )}

          {/* Harmonization Changes & Audit Report */}
          {result && <HarmonizationReportCard result={result} />}

          {!result && (
            <Card>
              <CardBody>
                <EmptyState
                  icon={<FlaskConical className="w-10 h-10 text-violet-500" />}
                  message="Upload your files and click Run Harmonization to see results"
                />
              </CardBody>
            </Card>
          )}
        </GridCol>

        {/* ─── Right Column: Stats, Fix Log & Rules ─── */}
        <GridCol span={3}>
          {/* Stats Card — only when result exists */}
          {result && (
            <Card>
              <CardHeader title="Stats" />
              <CardBody className="p-3 space-y-2">
                {Object.entries(result.stats).map(([k, v]: [string, unknown]) => (
                  <div key={k} className="flex justify-between px-2.5 py-1.5 rounded-lg bg-[var(--bg-tertiary)] text-[11px]">
                    <span className="text-[var(--text-tertiary)]">{k.replace(/_/g, ' ')}</span>
                    <span className="font-mono font-bold text-[var(--text-primary)]">{String(v)}</span>
                  </div>
                ))}
              </CardBody>
            </Card>
          )}

          {/* Fix Log Card — only when result exists */}
          {result && (
            <Card>
              <CardHeader title="Fix Log" subtitle={`${result.fix_log.length} entries`} />
              <CardBody className="p-3">
                <div className="space-y-1 max-h-[300px] overflow-y-auto scrollbar-thin scrollbar-thumb-[var(--border-light)] scrollbar-track-transparent">
                  {result.fix_log.map((log: string, i: number) => {
                    const isRule = log.startsWith('[');
                    const bracket = log.match(/^\[([^\]]+)\]/)?.[1] || '';
                    const rest = log.replace(/^\[[^\]]+\]\s*/, '');
                    return (
                      <div key={i} className="px-2.5 py-1.5 rounded-lg bg-[var(--bg-tertiary)]/50 text-[10px]">
                        {isRule && (
                          <span className="font-mono font-bold text-violet-600 dark:text-violet-400 mr-1">
                            [{bracket}]
                          </span>
                        )}
                        <span className="text-[var(--text-secondary)]">{rest}</span>
                      </div>
                    );
                  })}
                </div>
              </CardBody>
            </Card>
          )}

          {/* Rules Card — ALWAYS visible */}
          <Card>
            <CardHeader title={`11 Harmonization Rules`} subtitle={result ? 'Applied ✓' : undefined} />
            <CardBody className="p-3 space-y-1.5">
              {[
                ['Key-based Dedup', 'Remove duplicate key field rows', '🔑', 'Dedup'],
                ['Empty Row Filter', 'Remove 100% empty records', '🗑️', 'EmptyFilter'],
                ['Country → ISO', 'Full names to 2-3 letter ISO', '🌍', 'Country'],
                ['Currency → ISO', 'Map to ISO 4217 3-letter', '💱', 'Currency'],
                ['PayTerms → SAP', 'Convert text to NT30/NT45 etc', '💳', 'PayTerms'],
                ['MatType → SAP', 'Convert to ROH/FERT/HALB etc', '📦', 'MatType'],
                ['Whitespace Trim', 'All fields trimmed', '✂️', 'WhitespaceTrim'],
                ['Date → YYYYMMDD', 'SAP 8-digit date format', '📅', 'Date'],
                ['Phone Cleanup', 'Remove invalid characters', '📞', 'PhoneClean'],
                ['UOM → SAP', 'Normalize unit of measure', '📐', 'UOM'],
                ['Truncate 35', 'Name/address field limit', '✏️', 'Trunc35'],
              ].map(([t, d, emoji, logKey], i) => {
                const applied = result ? result.fix_log.some((l: string) => l.includes(`[${logKey}`)) : false;
                return (
                  <div key={i} className={`flex items-center gap-2 px-2.5 py-1.5 rounded-xl border transition-all duration-200 ${
                    applied
                      ? 'border-emerald-300 dark:border-emerald-600 bg-emerald-50/40 dark:bg-emerald-900/15'
                      : 'border-[var(--border)] bg-[var(--bg-tertiary)]/50'
                  }`}>
                    <span className="text-sm flex-shrink-0">{emoji}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-[11px] font-bold text-[var(--text-primary)] leading-tight">{t}</div>
                      <div className="text-[9.5px] text-[var(--text-tertiary)] leading-tight">{d}</div>
                    </div>
                    {result && (
                      applied
                        ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                        : <span className="text-[9px] text-[var(--text-tertiary)] flex-shrink-0">—</span>
                    )}
                  </div>
                );
              })}

              {!result && (
                <>
                  <div className="border-t border-[var(--border)] my-2" />
                  <div className="text-[10px] text-[var(--text-tertiary)] px-1">
                    <strong>Mapping CSV format:</strong>
                    <div className="font-mono mt-1 p-2 rounded bg-[var(--bg-tertiary)] text-[9px]">
                      src,sap,transform,confidence<br />
                      PARTY_NAME,NAME1,trim,90<br />
                      COUNTRY_CODE,LAND1,country,85<br />
                      CURRENCY,WAERS,currency,80
                    </div>
                  </div>
                </>
              )}
            </CardBody>
          </Card>
        </GridCol>

      </PageGrid>
    </PageLayout>
  );
}
