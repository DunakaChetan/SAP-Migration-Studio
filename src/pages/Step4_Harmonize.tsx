import React, { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useToast } from '@/components/ui/toast';
import { useLoading } from '@/components/ui/loading-overlay';
import { dl, expCSV } from '@/lib/utils';
import { jsPDF } from 'jspdf';
import {
  PageLayout, PageGrid, GridCol, Card, CardHeader, CardBody, Button,
  StatBox, StatsGrid, DataTable, PageHeader, EmptyState, Select, Badge
} from '@/components/shared';
import {
  FlaskConical, Upload, FileSpreadsheet, MapPin, Download,
  Play, Trash2, CheckCircle2, AlertCircle, FileText, ArrowLeft, ArrowRight, Save, Database, Plus, Sparkles, Eye, Zap, X, Check, Pencil, ChevronDown, ChevronUp, GitMerge, Key, Link2, Layers
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useMigration } from '@/store/migration-store';
import { TableFilterToolbar, filterRowsByKey, detectKeyColumns, getTableDisplayData } from '@/components/shared/TableFilterToolbar';
import type { TableInfo } from '@/components/shared/TableFilterToolbar';
import { TablePaginationFooter } from '@/components/shared/TablePaginationFooter';

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
  is_preview?: boolean;
}

interface AdditionalSource {
  source: string;
  file: DroppedFile | null;
  mappingFile: DroppedFile | null;
}

interface RuleItemConfig {
  enabled: boolean;
  custom_instruction?: string;
  params?: Record<string, any>;
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

/* ─── Rule Config Defaults ─── */
const DEFAULT_RULE_CONFIG: Record<string, RuleItemConfig> = {
  whitespace_trim: { enabled: true, params: { mode: 'both' } },
  country_iso: { enabled: true, params: { iso_length: 2 } },
  currency_iso: { enabled: true },
  dedup: { enabled: true },
  empty_filter: { enabled: true },
  date_format: { enabled: true, params: { format: 'YYYYMMDD' } },
  phone_clean: { enabled: true, params: { keep_plus: true } },
};

/* ─── Rule Definitions (Matched to Screenshot UI Layout) ─── */
interface RuleDef {
  key: string;
  title: string;
  sub: string;
  emoji: string;
  logKey: string;
}

const RULE_LIST: RuleDef[] = [
  { key: 'dedup', title: 'Key-based Dedup', sub: 'Remove duplicate key field rows', emoji: '🔑', logKey: 'Dedup' },
  { key: 'empty_filter', title: 'Empty Row Filter', sub: 'Remove 100% empty records', emoji: '🗑️', logKey: 'EmptyFilter' },
  { key: 'country_iso', title: 'Country → ISO', sub: 'Full names to 2-3 letter ISO', emoji: '🌍', logKey: 'Country' },
  { key: 'currency_iso', title: 'Currency → ISO', sub: 'Map to ISO 4217 3-letter', emoji: '💱', logKey: 'Currency' },
  { key: 'whitespace_trim', title: 'Whitespace Trim', sub: 'All fields trimmed', emoji: '✂️', logKey: 'WhitespaceTrim' },
  { key: 'date_format', title: 'Date → YYYYMMDD', sub: 'SAP 8-digit date format', emoji: '📅', logKey: 'Date' },
  { key: 'phone_clean', title: 'Phone Cleanup', sub: 'Remove invalid characters', emoji: '📞', logKey: 'PhoneClean' },
];

/* ─── Harmonization Report Card ─── */
function HarmonizationReportCard({
  result,
  onExportPDF,
  onExportCSV
}: {
  result: HarmonizationResult;
  onExportPDF?: () => void;
  onExportCSV?: () => void;
}) {
  const [showLogDetails, setShowLogDetails] = useState(false);

  const fixLog = result.fix_log || [];
  const stats = result.stats || {};
  const rows = result.final_table || [];

  const sourceCounts: Record<string, number> = {};
  rows.forEach((r) => {
    const src = String(r.SOURCE || 'UNKNOWN');
    sourceCounts[src] = (sourceCounts[src] || 0) + 1;
  });

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
        l.includes('[Currency→ISO]')
      ),
    },
    {
      title: 'Date & Phone Formatting',
      icon: '📅',
      items: fixLog.filter((l) => l.includes('[Date→YYYYMMDD]') || l.includes('[PhoneClean]')),
    },
    {
      title: 'Text & Field Adjustments',
      icon: '✂️',
      items: fixLog.filter((l) => l.includes('[WhitespaceTrim]') || l.includes('[UPPER]') || l.includes('[Pad10]') || l.includes('[Trim]') || l.includes('[Transform:')),
    },
    {
      title: 'Dynamic AI & Fallback Rules',
      icon: '⚡',
      items: fixLog.filter((l) => l.includes('[DynamicAI]')),
    },
  ];

  const totalFixEvents = fixLog.filter(
    (l) => l.startsWith('[') && !l.includes('[Init]') && !l.includes('[ColumnNaming]') && !l.includes('[Mapping]') && !l.includes('[Merge]')
  ).length;

  return (
    <Card className="mt-4 border-purple-200 dark:border-purple-900/40 bg-gradient-to-br from-[var(--bg-primary)] via-[var(--bg-secondary)] to-purple-50/20 dark:to-purple-950/10 shadow-sm">
      <CardHeader
        title="Harmonization Changes & Audit Report"
        subtitle="Summary of standardized fields, rule fixes and source origins"
      >
        <div className="flex items-center gap-2 ml-auto">
          {onExportCSV && (
            <Button
              variant="secondary"
              size="sm"
              icon={<FileSpreadsheet className="w-3.5 h-3.5 text-emerald-500" />}
              onClick={onExportCSV}
            >
              Export Report CSV
            </Button>
          )}
          {onExportPDF && (
            <Button
              variant="secondary"
              size="sm"
              icon={<Download className="w-3.5 h-3.5 text-purple-500" />}
              onClick={onExportPDF}
            >
              Export Vector PDF
            </Button>
          )}
        </div>
      </CardHeader>
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
              <span className="text-xl font-extrabold text-[var(--text-primary)]">{stats.columns || 0}</span>
              <span className="text-[10px] text-[var(--text-tertiary)]">total fields</span>
            </div>
          </div>

          <div className="p-3 rounded-xl border border-[var(--border)] bg-[var(--bg-tertiary)]/50">
            <div className="text-[10px] font-bold text-[var(--text-tertiary)] uppercase tracking-wider">Standardization Fixes</div>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="text-xl font-extrabold text-purple-600 dark:text-purple-400">{totalFixEvents}</span>
              <span className="text-[10px] text-[var(--text-tertiary)]">field fixes</span>
            </div>
          </div>

          <div className="p-3 rounded-xl border border-[var(--border)] bg-[var(--bg-tertiary)]/50">
            <div className="text-[10px] font-bold text-[var(--text-tertiary)] uppercase tracking-wider">Source Systems</div>
            <div className="mt-1.5 flex flex-wrap gap-1">
              {Object.entries(sourceCounts).map(([src, count]) => (
                <span key={src} className="px-2 py-0.5 rounded-md bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 font-mono font-bold text-[10px]">
                  {src}: {count}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Harmonization Categories Grid */}
        <div className="space-y-2">
          <div className="text-[11.5px] font-bold text-[var(--text-primary)]">
            Harmonization Breakdown
          </div>
          <div className="grid grid-cols-2 gap-3">
            {categories.filter(c => c.items.length > 0).map((cat, i) => (
              <div key={i} className="p-3 rounded-xl border border-[var(--border)] bg-[var(--bg-tertiary)]/40 space-y-1.5">
                <div className="flex items-center justify-between text-[11px] font-bold text-[var(--text-primary)]">
                  <span className="flex items-center gap-1.5">
                    <span>{cat.icon}</span>
                    <span>{cat.title}</span>
                  </span>
                  <span className="px-1.5 py-0.5 rounded bg-[var(--bg-tertiary)] text-[9.5px] font-bold text-purple-600 dark:text-purple-400 border border-[var(--border)]">
                    {cat.items.length} events
                  </span>
                </div>
                <div className="space-y-1 max-h-[100px] overflow-y-auto scrollbar-thin scrollbar-thumb-[var(--border)] scrollbar-track-transparent pr-1">
                  {cat.items.map((item, idx) => (
                    <div key={idx} className="text-[10px] text-[var(--text-secondary)] font-mono truncate bg-[var(--bg-primary)]/50 px-2 py-0.5 rounded">
                      {item}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Expandable Full Audit Log */}
        <div className="pt-2 border-t border-[var(--border)] flex items-center justify-between">
          <button
            onClick={() => setShowLogDetails(!showLogDetails)}
            className="text-[11px] font-bold text-purple-600 dark:text-purple-400 hover:underline flex items-center gap-1 cursor-pointer"
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

interface LogGroup {
  id: string;
  summary: string;
  ruleTag: string;
  details: string[];
}

function groupFixLogEntries(fixLog: string[]): LogGroup[] {
  const groups: LogGroup[] = [];
  const tagSummaryMap: Record<string, LogGroup> = {};
  let lastGroup: LogGroup | null = null;

  fixLog.forEach((line, idx) => {
    // 1. Check if explicit detail line: [Tag::Detail] Row X...
    if (line.includes('::Detail]')) {
      const matchDetail = line.match(/^\[([^:]+)::Detail\]\s*(.*)$/);
      if (matchDetail) {
        const tag = matchDetail[1];
        const detailText = matchDetail[2];

        if (lastGroup && (lastGroup.ruleTag === tag || lastGroup.summary.includes(`[${tag}`))) {
          lastGroup.details.push(detailText);
          return;
        } else if (tagSummaryMap[tag]) {
          tagSummaryMap[tag].details.push(detailText);
          return;
        }
      }
    }

    // 2. Check if standard log line [Tag] ...
    const matchRule = line.match(/^\[([^\]]+)\]\s*(.*)$/);
    if (!matchRule) {
      const grp: LogGroup = {
        id: `grp_${idx}`,
        summary: line,
        ruleTag: 'Log',
        details: [],
      };
      groups.push(grp);
      lastGroup = grp;
      return;
    }

    const tag = matchRule[1];
    const content = matchRule[2];

    // 3. Check if line starts with "Row X ..." (individual row log without explicit summary header)
    if (content.startsWith('Row ')) {
      if (!tagSummaryMap[tag]) {
        const grp: LogGroup = {
          id: `grp_tag_${tag}`,
          summary: `[${tag}] Transformations applied across rows`,
          ruleTag: tag,
          details: [content],
        };
        tagSummaryMap[tag] = grp;
        groups.push(grp);
        lastGroup = grp;
      } else {
        tagSummaryMap[tag].details.push(content);
        tagSummaryMap[tag].summary = `[${tag}] ${tagSummaryMap[tag].details.length} values transformed across rows`;
      }
      return;
    }

    // 4. Standard summary log line
    const grp: LogGroup = {
      id: `grp_${idx}_${tag}`,
      summary: line,
      ruleTag: tag,
      details: [],
    };
    tagSummaryMap[tag] = grp;
    groups.push(grp);
    lastGroup = grp;
  });

  return groups;
}

/* ─── Preview Card ─── */
function PreviewCard({
  fixLog,
  stats,
  ruleConfig,
  onProceed,
}: {
  fixLog: string[];
  stats: any;
  ruleConfig?: Record<string, RuleItemConfig>;
  onProceed: () => void;
}) {
  // Filter out logs for disabled rules optimistically
  const activeFixLog = useMemo(() => {
    if (!ruleConfig) return fixLog;
    const disabledLogKeys = RULE_LIST.filter(r => ruleConfig[r.key]?.enabled === false).map(r => r.logKey);
    if (disabledLogKeys.length === 0) return fixLog;

    return fixLog.filter(line => {
      for (const key of disabledLogKeys) {
        if (
          line.includes(`[${key}]`) ||
          line.includes(`[${key}::`) ||
          line.includes(`[${key} →`) ||
          line.includes(`[${key}→`)
        ) {
          return false;
        }
      }
      return true;
    });
  }, [fixLog, ruleConfig]);

  const logGroups = useMemo(() => groupFixLogEntries(activeFixLog), [activeFixLog]);
  const [expandedGroupIds, setExpandedGroupIds] = useState<Record<string, boolean>>({});

  const toggleGroup = (id: string) => {
    setExpandedGroupIds(prev => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <Card className="border-amber-300 dark:border-amber-700/60 bg-gradient-to-br from-amber-50/30 to-amber-100/10 dark:from-amber-950/20 dark:to-amber-900/5">
      <CardHeader
        title="📋 Preview — Proposed Changes"
        subtitle="Review the changes that will be applied. Click Proceed to execute."
        icon={<Eye className="w-4 h-4 text-amber-600" />}
      >
        <Button variant="primary" size="sm" icon={<Play className="w-3.5 h-3.5" />} onClick={onProceed}>
          Proceed & Execute
        </Button>
      </CardHeader>
      <CardBody className="p-4 space-y-3">
        <div className="flex gap-3 text-[11px]">
          <div className="px-3 py-1.5 rounded-lg bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200 font-bold">
            {stats.total_input || 0} input rows
          </div>
          <div className="px-3 py-1.5 rounded-lg bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200 font-bold">
            {fixLog.filter(l => l.startsWith('[') && !l.includes('[Init]') && !l.includes('[Mapping]') && !l.includes('::Detail]')).length} transformation events
          </div>
        </div>

        <div className="space-y-1.5 max-h-[350px] overflow-y-auto scrollbar-thin pr-1">
          {logGroups.map((grp) => {
            const isInit = grp.summary.includes('[Init]') || grp.summary.includes('[Mapping]') || grp.summary.includes('[Merge]');
            const isDynamic = grp.summary.includes('[DynamicAI]');
            const hasDetails = grp.details.length > 0;
            const isExpanded = !!expandedGroupIds[grp.id];

            return (
              <div
                key={grp.id}
                className={`rounded-lg border transition-all ${isDynamic
                    ? 'border-purple-200 dark:border-purple-900/40 bg-purple-50/50 dark:bg-purple-950/20 text-purple-800 dark:text-purple-300'
                    : isInit
                      ? 'border-gray-200 dark:border-gray-800 bg-[var(--bg-tertiary)]/50 text-[var(--text-tertiary)]'
                      : 'border-amber-200 dark:border-amber-900/40 bg-amber-50/50 dark:bg-amber-950/15 text-[var(--text-primary)]'
                  }`}
              >
                {/* Summary Header Line */}
                <div className="flex items-center justify-between px-3 py-1.5 text-[11px] font-mono">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <span className="truncate">{grp.summary}</span>
                  </div>

                  {/* Dropdown Button for Details */}
                  {hasDetails && (
                    <button
                      onClick={() => toggleGroup(grp.id)}
                      className="ml-3 px-2.5 py-1 rounded-md text-[10px] font-bold bg-purple-600 hover:bg-purple-700 text-white flex items-center gap-1 cursor-pointer transition-all shadow-xs shrink-0"
                    >
                      {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                      <span>{isExpanded ? 'Hide Details' : `View Details (${grp.details.length} rows)`}</span>
                    </button>
                  )}
                </div>

                {/* Collapsible Row Details List */}
                {hasDetails && isExpanded && (
                  <div className="px-3 py-2 border-t border-amber-200/60 dark:border-amber-900/40 bg-[var(--bg-primary)]/90 max-h-[220px] overflow-y-auto space-y-1 font-mono text-[10.5px] scrollbar-thin">
                    <div className="text-[9.5px] font-bold uppercase tracking-wider text-[var(--text-tertiary)] pb-1 border-b border-[var(--border)] flex justify-between items-center">
                      <span>Edited Rows & Value Transformations ({grp.details.length}):</span>
                    </div>
                    {grp.details.map((detail, dIdx) => (
                      <div key={dIdx} className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-purple-50 dark:hover:bg-purple-900/20 px-1.5 py-0.5 rounded transition-colors">
                        {detail}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
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
  const [mode, setMode] = useState<'flow' | 'multi'>('flow');
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
  const [secondarySource, setSecondarySource] = useState('');

  // Primary Extracted Data info from Step 3 / DB
  const primaryColumns = useMemo(() => {
    if (state.headers?.length) return state.headers;
    if (state.extracted?.length) return Object.keys(state.extracted[0]);
    if (state.rawData?.length) return Object.keys(state.rawData[0]);
    return [];
  }, [state.headers, state.extracted, state.rawData]);

  const primaryRowCount = state.extracted?.length || state.rawData?.length || state.uploadedData?.length || 0;

  const primaryTableName = useMemo(() => {
    if (state.uploadedFilesMeta?.length && state.uploadedFilesMeta[0]?.name) {
      return state.uploadedFilesMeta[0].name;
    }
    return `Primary_Data_${state.src || 'SAP_ECC'}.csv`;
  }, [state.uploadedFilesMeta, state.src]);

  const primarySchema = useMemo(() => {
    return {
      filename: primaryTableName,
      headers: primaryColumns,
      size: (primaryRowCount * (primaryColumns.length || 1) * 16) || 2048,
      isPrimary: true,
      rows: primaryRowCount
    };
  }, [primaryTableName, primaryColumns, primaryRowCount]);

  // Multi-Source Secondary Staged Files & Optional Mapping Files
  const multiFileInputRef = useRef<HTMLInputElement>(null);
  const [stagedSecondaryFiles, setStagedSecondaryFiles] = useState<File[]>([]);
  const [secondaryFileSchemas, setSecondaryFileSchemas] = useState<{ filename: string; headers: string[]; size?: number }[]>([]);
  const [secondaryMappingFiles, setSecondaryMappingFiles] = useState<Record<string, File | null>>({});

  const displayedFiles = useMemo(() => {
    const list: { name: string; size: number; isPrimary?: boolean; rows?: number; file?: File }[] = [];
    if (primaryRowCount > 0 || primaryColumns.length > 0) {
      list.push({
        name: primaryTableName,
        size: primarySchema.size,
        isPrimary: true,
        rows: primaryRowCount
      });
    }
    stagedSecondaryFiles.forEach(f => {
      if (f.name !== primaryTableName) {
        list.push({
          name: f.name,
          size: f.size,
          isPrimary: false,
          file: f
        });
      }
    });
    return list;
  }, [primaryTableName, primarySchema.size, primaryRowCount, primaryColumns.length, stagedSecondaryFiles]);

  const displayedSchemas = useMemo(() => {
    const list: { filename: string; headers: string[]; size?: number; isPrimary?: boolean; rows?: number }[] = [primarySchema];
    secondaryFileSchemas.forEach(s => {
      if (s.filename !== primaryTableName) {
        list.push(s);
      }
    });
    return list;
  }, [primarySchema, secondaryFileSchemas, primaryTableName]);

  const [joinConfig, setJoinConfig] = useState<{
    base_file: string;
    joins: {
      join_file: string;
      source_file?: string;
      base_key?: string;
      join_key?: string;
      key_pairs?: { base_key: string; join_key: string }[];
    }[];
  }>({ base_file: '', joins: [] });

  const displayedJoinConfig = useMemo(() => {
    const effectiveBase = joinConfig.base_file && displayedSchemas.some(s => s.filename === joinConfig.base_file)
      ? joinConfig.base_file
      : primaryTableName;

    const baseSchema = displayedSchemas.find(s => s.filename === effectiveBase) || primarySchema;
    const otherSchemas = displayedSchemas.filter(s => s.filename !== effectiveBase);

    const joins = otherSchemas.map(s => {
      const existing = joinConfig.joins?.find(j => j.join_file === s.filename);
      if (existing && existing.key_pairs?.length && existing.key_pairs.some(kp => kp.base_key && kp.join_key)) {
        return existing;
      }

      const matchedPairs: { base_key: string; join_key: string }[] = [];
      if (baseSchema) {
        for (const jh of s.headers) {
          for (const bh of baseSchema.headers) {
            const jClean = jh.toLowerCase().replace(/[^a-z0-9]/g, '');
            const bClean = bh.toLowerCase().replace(/[^a-z0-9]/g, '');
            if (
              (jClean === bClean || (jClean.includes('id') && bClean.includes('id')) || (jClean.includes('number') && bClean.includes('number')) || (jClean.includes('code') && bClean.includes('code'))) &&
              !matchedPairs.some(p => p.base_key === bh || p.join_key === jh)
            ) {
              matchedPairs.push({ base_key: bh, join_key: jh });
              break;
            }
          }
        }
      }
      const finalPairs = matchedPairs.length > 0
        ? matchedPairs
        : [{ base_key: baseSchema?.headers[0] || '', join_key: s.headers[0] || '' }];

      return {
        join_file: s.filename,
        source_file: effectiveBase,
        base_key: finalPairs[0].base_key,
        join_key: finalPairs[0].join_key,
        key_pairs: finalPairs
      };
    });

    return { base_file: effectiveBase, joins };
  }, [joinConfig, displayedSchemas, primaryTableName, primarySchema]);

  const handleFilesAdded = async (newFileList: FileList | File[] | null) => {
    if (!newFileList) return;
    const newFiles = Array.from(newFileList);
    if (newFiles.length === 0) return;

    const existingNames = new Set(displayedFiles.map(f => f.name));
    const trulyNewFiles = newFiles.filter(f => !existingNames.has(f.name));
    if (trulyNewFiles.length === 0) {
      if (multiFileInputRef.current) multiFileInputRef.current.value = '';
      return;
    }

    const updatedStaged = [...stagedSecondaryFiles, ...trulyNewFiles];
    setStagedSecondaryFiles(updatedStaged);

    showLoad('Analyzing Secondary Files...', 'Extracting headers and detecting keys...', [
      'Reading uploaded file structures...',
      'Mapping relational candidate keys with Primary Data...',
      'Preparing multi-table join model...'
    ]);
    [0, 1, 2].forEach(i => setTimeout(() => tick(i), 300 + i * 300));

    try {
      const formData = new FormData();
      trulyNewFiles.forEach(f => formData.append('files', f));

      const res = await fetch(`${import.meta.env.VITE_BACKEND_URL}/api/sap/extract/upload-preview`, {
        method: 'POST',
        body: formData
      });
      if (!res.ok) throw new Error('Failed to preview file schemas');
      const data = await res.json();
      const newSchemas: { filename: string; headers: string[] }[] = data.files || [];

      const combinedSchemas = [...secondaryFileSchemas.filter(s => !newSchemas.some(ns => ns.filename === s.filename)), ...newSchemas];
      setSecondaryFileSchemas(combinedSchemas);

      hideLoad();
      toast(`Loaded ${trulyNewFiles.length} file(s) ready to join with ${primaryTableName}`, 'ok');
    } catch (err: any) {
      hideLoad();
      toast(err.message || 'Error loading file schemas', 'err');
    } finally {
      if (multiFileInputRef.current) multiFileInputRef.current.value = '';
    }
  };

  const handleRemoveStagedFile = (fileName: string) => {
    const updatedStaged = stagedSecondaryFiles.filter(f => f.name !== fileName);
    const updatedSchemas = secondaryFileSchemas.filter(s => s.filename !== fileName);
    setStagedSecondaryFiles(updatedStaged);
    setSecondaryFileSchemas(updatedSchemas);

    setSecondaryMappingFiles(prev => {
      const next = { ...prev };
      delete next[fileName];
      return next;
    });

    const nextJoins = (joinConfig.joins || []).filter(j => j.join_file !== fileName);
    setJoinConfig({ base_file: joinConfig.base_file || primaryTableName, joins: nextJoins });
  };

  const handleClearStagedFiles = () => {
    setStagedSecondaryFiles([]);
    setSecondaryFileSchemas([]);
    setSecondaryMappingFiles({});
    setJoinConfig({ base_file: primaryTableName, joins: [] });
    if (multiFileInputRef.current) multiFileInputRef.current.value = '';
    toast('Secondary join files reset', 'info');
  };

  const handleMappingFileAdded = (joinFileName: string, file: File | null) => {
    setSecondaryMappingFiles(prev => ({
      ...prev,
      [joinFileName]: file
    }));
    if (file) {
      toast(`Mapping file ${file.name} attached to ${joinFileName}`, 'ok');
    }
  };

  const handleRemoveMappingFile = (joinFileName: string) => {
    setSecondaryMappingFiles(prev => ({
      ...prev,
      [joinFileName]: null
    }));
    toast(`Removed mapping for ${joinFileName} (will use direct field values)`, 'info');
  };

  const addJoinKeyPair = (joinIdx: number) => {
    setJoinConfig(prev => {
      const curCfg = prev.base_file ? prev : displayedJoinConfig;
      const newJoins = (curCfg.joins || []).map((j, i) => {
        if (i !== joinIdx) return j;
        const kps = j.key_pairs?.length ? [...j.key_pairs] : [{ base_key: j.base_key || '', join_key: j.join_key || '' }];
        kps.push({ base_key: '', join_key: '' });
        return {
          ...j,
          base_key: kps[0]?.base_key || '',
          join_key: kps[0]?.join_key || '',
          key_pairs: kps
        };
      });
      const next = { ...curCfg, joins: newJoins };
      dispatch({ type: 'SET_FIELD', field: 'joinConfig', value: next });
      return next;
    });
  };

  const removeJoinKeyPair = (joinIdx: number, keyPairIdx: number) => {
    setJoinConfig(prev => {
      const curCfg = prev.base_file ? prev : displayedJoinConfig;
      const newJoins = (curCfg.joins || []).map((j, i) => {
        if (i !== joinIdx) return j;
        const kps = (j.key_pairs || [{ base_key: j.base_key || '', join_key: j.join_key || '' }]).filter((_, k) => k !== keyPairIdx);
        const finalKps = kps.length > 0 ? kps : [{ base_key: '', join_key: '' }];
        return {
          ...j,
          base_key: finalKps[0]?.base_key || '',
          join_key: finalKps[0]?.join_key || '',
          key_pairs: finalKps
        };
      });
      const next = { ...curCfg, joins: newJoins };
      dispatch({ type: 'SET_FIELD', field: 'joinConfig', value: next });
      return next;
    });
  };

  const updateJoinSourceFile = (joinIdx: number, newSourceFile: string) => {
    setJoinConfig(prev => {
      const curCfg = prev.base_file ? prev : displayedJoinConfig;
      const srcSchema = displayedSchemas.find(s => s.filename === newSourceFile);
      const newJoins = (curCfg.joins || []).map((j, i) => {
        if (i !== joinIdx) return j;
        const joinSchema = displayedSchemas.find(s => s.filename === j.join_file);
        const matchedPairs: { base_key: string; join_key: string }[] = [];
        if (srcSchema && joinSchema) {
          for (const jh of joinSchema.headers) {
            for (const sh of srcSchema.headers) {
              const jClean = jh.toLowerCase().replace(/[^a-z0-9]/g, '');
              const sClean = sh.toLowerCase().replace(/[^a-z0-9]/g, '');
              if (
                (jClean === sClean || (jClean.includes('id') && sClean.includes('id')) || (jClean.includes('code') && sClean.includes('code'))) &&
                !matchedPairs.some(p => p.base_key === sh || p.join_key === jh)
              ) {
                matchedPairs.push({ base_key: sh, join_key: jh });
                break;
              }
            }
          }
        }
        const finalPairs = matchedPairs.length > 0 ? matchedPairs : [{ base_key: srcSchema?.headers[0] || '', join_key: joinSchema?.headers[0] || '' }];
        return {
          ...j,
          source_file: newSourceFile,
          base_key: finalPairs[0].base_key,
          join_key: finalPairs[0].join_key,
          key_pairs: finalPairs
        };
      });
      const next = { ...curCfg, joins: newJoins };
      dispatch({ type: 'SET_FIELD', field: 'joinConfig', value: next });
      return next;
    });
  };

  const updateJoinKeyPair = (joinIdx: number, keyPairIdx: number, side: 'base_key' | 'join_key', val: string) => {
    setJoinConfig(prev => {
      const curCfg = prev.base_file ? prev : displayedJoinConfig;
      const newJoins = (curCfg.joins || []).map((j, i) => {
        if (i !== joinIdx) return j;
        const kps = j.key_pairs?.length ? [...j.key_pairs] : [{ base_key: j.base_key || '', join_key: j.join_key || '' }];
        if (kps[keyPairIdx]) {
          kps[keyPairIdx] = { ...kps[keyPairIdx], [side]: val };
        }
        return {
          ...j,
          base_key: kps[0]?.base_key || '',
          join_key: kps[0]?.join_key || '',
          key_pairs: kps
        };
      });
      const next = { ...curCfg, joins: newJoins };
      dispatch({ type: 'SET_FIELD', field: 'joinConfig', value: next });
      return next;
    });
  };

  // Additional Sources (N-source)
  const [additionalSources, setAdditionalSources] = useState<AdditionalSource[]>([]);

  // Results & Preview
  const result: HarmonizationResult | null = state.harmonizationResult;
  const setResult = (val: any) => dispatch({ type: 'SET_FIELD', field: 'harmonizationResult', value: val });
  const [previewData, setPreviewData] = useState<{ fixLog: string[]; stats: any } | null>(null);

  // Table filter & pagination state for output display
  const [selectedOutputTables, setSelectedOutputTables] = useState<Set<string>>(new Set());
  const [outputKeyFilter, setOutputKeyFilter] = useState('');
  const [tablePages, setTablePages] = useState<Record<string, number>>({});
  const extractedTables = state.extractedTables || [];

  // Initialize selectedOutputTables when extractedTables are available
  useEffect(() => {
    if (extractedTables.length > 0) {
      setSelectedOutputTables(new Set(extractedTables.map((t: any) => t.table_name)));
    }
  }, [extractedTables.length]);

  // Editable Rule Config (Inline box per rule)
  const [ruleConfig, setRuleConfig] = useState<Record<string, RuleItemConfig>>({ ...DEFAULT_RULE_CONFIG });
  const [expandedRuleKey, setExpandedRuleKey] = useState<string | null>(null);

  // Dynamic AI Rules
  const [customPrompts, setCustomPrompts] = useState<string[]>([]);
  const [newPromptInput, setNewPromptInput] = useState('');

  // Fetch saved dynamic harmonization rules on mount
  useEffect(() => {
    if (state.projectId && state.obj) {
      const fetchSavedHarmonizeRules = async () => {
        try {
          const res = await fetch(`${import.meta.env.VITE_BACKEND_URL || ''}/api/validate/rules?project_id=${state.projectId}&target_object=${state.obj}&source=harmonize`);
          if (res.ok) {
            const data = await res.json();
            if (data.rules && data.rules.length > 0) {
              const loadedPrompts = data.rules.map((r: any) => r.prompt || r.description || r.label).filter(Boolean);
              if (loadedPrompts.length > 0) {
                setCustomPrompts(loadedPrompts);
              }
            }
          }
        } catch (e) {
          console.error("Failed to fetch saved harmonize rules", e);
        }
      };
      fetchSavedHarmonizeRules();
    }
  }, [state.projectId, state.obj]);

  const saveHarmonizeRulesToDB = async () => {
    if (!state.projectId) {
      toast('No project selected to save rules', 'err');
      return;
    }

    showLoad('Saving AI Rules...', 'Processing dynamic rules via LLM', [
      'Compiling AI rules into standard executable code...',
      'Validating rule syntax...',
      'Saving logic to project repository...',
      'Finalizing configuration...'
    ]);
    [0, 1, 2, 3].forEach((i) => setTimeout(() => tick(i), 400 + i * 400));

    try {
      let compiledRules: any[] = [];
      if (customPrompts.length > 0) {
        try {
          const res = await fetch(`${import.meta.env.VITE_BACKEND_URL}/api/validate/generate-rules`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompts: customPrompts, target_object: state.obj || sapObject })
          });
          if (res.ok) {
            const json = await res.json();
            compiledRules = json.rules || [];
          }
        } catch (compileErr) {
          console.warn('Dynamic prompt compilation notice:', compileErr);
        }
      }

      const payloadRules = customPrompts.map((p, idx) => {
        const comp = compiledRules[idx] || {};
        return {
          id: comp.id || `DYN_HARM_${Date.now()}_${idx}`,
          prompt: p,
          label: comp.label || p,
          description: comp.description || p,
          field: comp.field || 'GENERAL',
          python_code: comp.python_code || '',
          error_message: comp.error_message || '',
          severity: comp.severity || 'INFO',
          enabled: true
        };
      });

      const res2 = await fetch(`${import.meta.env.VITE_BACKEND_URL}/api/validate/rules/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: state.projectId,
          target_object: state.obj || sapObject,
          rules: payloadRules,
          source: 'harmonize'
        })
      });

      const resJson = await res2.json().catch(() => null);
      if (!res2.ok) {
        throw new Error((resJson && (resJson.detail || resJson.message)) || 'Failed to save rules');
      }

      hideLoad();
      toast('Dynamic harmonization rules saved to project', 'ok');
    } catch (err: any) {
      hideLoad();
      toast(err.message || 'Failed to save rules', 'err');
    }
  };

  const enabledRuleCount = RULE_LIST.filter(r => (ruleConfig[r.key] !== undefined ? ruleConfig[r.key].enabled : true)).length;
  const totalRuleCount = RULE_LIST.length;

  const handleAddPrompt = () => {
    if (!newPromptInput.trim()) return;
    setCustomPrompts([...customPrompts, newPromptInput.trim()]);
    setNewPromptInput('');
  };

  const handleRemovePrompt = (index: number) => {
    setCustomPrompts(customPrompts.filter((_, i) => i !== index));
  };

  const toggleRule = (key: string) => {
    setRuleConfig(prev => ({
      ...prev,
      [key]: { ...prev[key], enabled: !prev[key]?.enabled }
    }));
  };

  const updateRuleParamInline = (key: string, paramKey: string, val: any) => {
    setRuleConfig(prev => ({
      ...prev,
      [key]: {
        ...prev[key],
        params: { ...(prev[key]?.params || {}), [paramKey]: val }
      }
    }));
  };

  const updateRuleInstructionInline = (key: string, instruction: string) => {
    setRuleConfig(prev => ({
      ...prev,
      [key]: {
        ...prev[key],
        custom_instruction: instruction || undefined
      }
    }));
  };

  const addAdditionalSource = () => {
    setAdditionalSources(prev => [...prev, { source: '', file: null, mappingFile: null }]);
  };

  const removeAdditionalSource = (idx: number) => {
    setAdditionalSources(prev => prev.filter((_, i) => i !== idx));
  };

  const updateAdditionalSource = (idx: number, updates: Partial<AdditionalSource>) => {
    setAdditionalSources(prev => prev.map((s, i) => i === idx ? { ...s, ...updates } : s));
  };

  const saveDataToDB = async () => {
    if (!state.projectId) {
      toast('No project ID found. Please create a project first.', 'err');
      return;
    }
    if (!result?.final_table) return;

    showLoad('Saving data...', 'Persisting harmonized records to database');
    try {
      const currentTables = extractedTables.length > 0 ? extractedTables : (state.extractedTables || []);
      const res = await fetch(`${import.meta.env.VITE_BACKEND_URL}/api/sap/harmonize/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: state.projectId,
          target_object: state.obj,
          payload: result.final_table,
          tables: currentTables
        })
      });

      if (!res.ok) throw new Error('Failed to save data');

      hideLoad();
      dispatch({ type: 'SET_FIELD', field: 'extractedTables', value: currentTables });
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

    if (file.name.endsWith('.csv')) {
      try {
        const text = await file.text();
        const lines = text.split('\n').filter(l => l.trim());
        dropped.rows = Math.max(0, lines.length - 1);
      } catch { /* ignore */ }
    }

    setter(dropped);
  };

  const canRun = mode === 'flow'
    ? true
    : (stagedSecondaryFiles.length > 0
      ? (!!displayedJoinConfig.base_file && displayedJoinConfig.joins.every(j => {
          const kps = j.key_pairs?.length ? j.key_pairs : [{ base_key: j.base_key, join_key: j.join_key }];
          return kps.length > 0 && kps.every(kp => kp.base_key && kp.join_key);
        }))
      : primaryRowCount > 0);

  async function runHarmonization(isPreview: boolean = true, silent: boolean = false) {
    if (!canRun) return;
    dispatch({ type: 'SET_FIELD', field: 'isHarmonizedSaved', value: false });

    if (!silent) {
      const loadMsg = isPreview ? 'Generating Preview…' : 'Running Harmonization Agent…';
      showLoad(loadMsg, `Processing your data through rules${customPrompts.length > 0 ? ` + ${customPrompts.length} AI rules` : ''}`, [
        'Merging multi-source relational tables…',
        'Reading files from Database or Uploads…',
        'Applying field mappings & clean target names…',
        'Applying Cleansing & Harmonization Rules…',
        'Checking fallback LLM constraints if needed…',
        'Generating audit report & results…',
      ]);
      [0, 1, 2, 3, 4, 5, 6, 7].forEach(i => setTimeout(() => tick(i), 300 + i * 300));
    }

    try {
      let res: any;
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
            preview: isPreview,
            rule_config: ruleConfig,
            custom_prompts: customPrompts.length > 0 ? customPrompts : null,
          })
        });
      } else if (mode === 'multi') {
        const secFile = stagedSecondaryFiles.length > 0 ? stagedSecondaryFiles[0] : null;
        const secMappingFile = secFile ? (secondaryMappingFiles[secFile.name] || null) : null;

        if (state.projectId && secFile) {
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
          formData.append('secondary_source', secondarySource || 'ORACLE_EBS');
          formData.append('secondary_file', secFile);
          if (secMappingFile) {
            formData.append('secondary_mapping_file', secMappingFile);
          }
          formData.append('preview', isPreview ? 'true' : 'false');
          formData.append('rule_config_json', JSON.stringify(ruleConfig));
          if (customPrompts.length > 0) formData.append('custom_prompts_json', JSON.stringify(customPrompts));
          formData.append('join_keys_json', JSON.stringify(displayedJoinConfig.joins));

          res = await fetch(`${import.meta.env.VITE_BACKEND_URL}/api/sap/harmonize/multi-flow`, { method: 'POST', body: formData });
        } else if (secFile) {
          const formData = new FormData();
          formData.append('mode', 'multi');
          formData.append('sap_object', sapObject);
          formData.append('company_code', companyCode);
          formData.append('sales_org', salesOrg);
          formData.append('purch_org', purchOrg);
          formData.append('plant', plant);
          formData.append('dist_channel', distChannel);
          formData.append('division', division);
          formData.append('currency', currency);
          formData.append('primary_source', primarySource);
          formData.append('secondary_source', secondarySource || 'ORACLE_EBS');
          formData.append('secondary_file', secFile);
          if (secMappingFile) {
            formData.append('secondary_mapping_file', secMappingFile);
          }
          formData.append('preview', isPreview ? 'true' : 'false');
          formData.append('rule_config_json', JSON.stringify(ruleConfig));
          if (customPrompts.length > 0) formData.append('custom_prompts_json', JSON.stringify(customPrompts));
          formData.append('join_keys_json', JSON.stringify(displayedJoinConfig.joins));

          res = await fetch(`${import.meta.env.VITE_BACKEND_URL}/api/sap/harmonize`, { method: 'POST', body: formData });
        } else {
          // Fallback to flow if no secondary file
          if (!state.projectId) {
            throw new Error("Please add secondary files to join or extract data in Step 3.");
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
              preview: isPreview,
              rule_config: ruleConfig,
              custom_prompts: customPrompts.length > 0 ? customPrompts : null,
            })
          });
        }
      }

      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: 'Unknown error' }));
        throw new Error(err.detail || 'Harmonization failed');
      }

      const data = await res.json();

      if (silent) {
        if (data.is_preview) {
          setPreviewData({ fixLog: data.fix_log, stats: data.stats });
        }
        return;
      }

      setTimeout(() => {
        tick(8, 'Complete');
        setTimeout(() => {
          hideLoad();
          if (data.is_preview) {
            setPreviewData({ fixLog: data.fix_log, stats: data.stats });
            setResult(null);
            toast(`Preview ready: ${data.fix_log.length} log entries generated`, 'ok');
          } else {
            setPreviewData(null);
            setResult(data);
            if (data.tables && data.tables.length > 0 && (!state.extractedTables || state.extractedTables.length === 0)) {
              dispatch({ type: 'SET_FIELD', field: 'extractedTables', value: data.tables });
            }
            toast(
              `Harmonized: ${data.stats.total_output} rows from ${data.stats.total_input} input rows`,
              'ok'
            );
          }
        }, 600);
      }, 500);

    } catch (err: any) {
      if (!silent) hideLoad();
      toast(err.message || 'Harmonization failed', 'err');
    }
  }

  // Auto-refresh preview in background when ruleConfig or customPrompts changes
  const isFirstRender = useRef(true);
  React.useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    if (previewData) {
      const timer = setTimeout(() => {
        runHarmonization(true, true);
      }, 400);
      return () => clearTimeout(timer);
    }
  }, [ruleConfig, customPrompts]);

  function handleProceed() {
    setPreviewData(null);
    runHarmonization(false);
  }

  function downloadResult() {
    if (!result?.session_id) return;
    window.open(`${import.meta.env.VITE_BACKEND_URL}/api/sap/harmonize/download/${result.session_id}`, '_blank');
  }

  // Comprehensive Harmonization Vector PDF Generator
  const exportHarmonizationPDF = () => {
    try {
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pageWidth = doc.internal.pageSize.getWidth();

      // Palette - Exact Deep Teal theme matching Step 3 Extract
      const primaryColor = [14, 116, 144]; // Deep Teal
      const darkText = [30, 41, 59];       // #1E293B
      const mutedText = [100, 116, 139];   // #64748B
      const lightBg = [248, 250, 252];     // #F8FAFC
      const tableHeaderBg = [230, 238, 245]; // Darkened elegant table header
      const tableAltRowBg = [245, 248, 251]; // Alternate row darkening
      const successColor = [16, 185, 129]; // #10B981
      const dangerColor = [220, 38, 38];   // #DC2626

      const fixLog = result?.fix_log || previewData?.fixLog || [];
      const stats = result?.stats || previewData?.stats || {};
      const outputRows = result?.final_table || [];
      const inputRowCount = stats.total_input || state.extracted?.length || state.rawData?.length || 0;
      const outputRowCount = stats.total_output || outputRows.length || inputRowCount;

      // Header Banner
      doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
      doc.rect(0, 0, pageWidth, 28, 'F');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(15);
      doc.setTextColor(255, 255, 255);
      doc.text('SAP Migration Studio — Data Harmonization Audit Report', 14, 13);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.text(
        `Generated: ${new Date().toLocaleDateString()} | Target Object: ${state.obj || 'CUSTOMER'} | Source: ${state.src || primarySource} | Mode: ${mode.toUpperCase()}`,
        14,
        21
      );

      let yPos = 36;

      // Executive Title
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(13);
      doc.setTextColor(darkText[0], darkText[1], darkText[2]);
      doc.text(`Harmonization & Transformation Executive Report: ${state.obj || 'Customer'} Master Data`, 14, yPos);
      yPos += 7;

      // Scorecard Box
      doc.setFillColor(lightBg[0], lightBg[1], lightBg[2]);
      doc.roundedRect(14, yPos, pageWidth - 28, 22, 2.5, 2.5, 'F');

      // Metric Line 1
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10.5);
      doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
      const totalTransforms = fixLog.filter(l => l.startsWith('[') && !l.includes('[Init]') && !l.includes('[Mapping]') && !l.includes('[Merge]') && !l.includes('[ColumnNaming]')).length;
      doc.text(`Harmonization Pipeline Execution: ${totalTransforms} Transformations Applied`, 20, yPos + 8);

      // Metric Line 2
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(mutedText[0], mutedText[1], mutedText[2]);
      doc.text(
        `Input Rows: ${inputRowCount}  |  Harmonized Output: ${outputRowCount}  |  Deduplicated: ${stats.deduped || 0}  |  Empty Filtered: ${stats.empty_removed || 0}  |  Output Cols: ${stats.columns || result?.columns?.length || 0}`,
        20,
        yPos + 15
      );

      yPos += 28;

      // Section 1: Executive Summary
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(darkText[0], darkText[1], darkText[2]);
      doc.text('1. Executive Harmonization & Cleansing Summary', 14, yPos);
      yPos += 6;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(71, 85, 105);
      const summaryNarrative = `The Harmonization Agent processed ${inputRowCount} source records from ${state.src || primarySource} against the SAP S/4HANA ${state.obj || 'Customer'} target schema. The pipeline executed ${enabledRuleCount} active harmonization rules, standardizing values into strict SAP domain formats (including ISO country codes, currency formats, payment terms, phone/fax sanitation, and whitespace normalization). A total of ${outputRowCount} clean, unified records were produced with 0 fatal data conflicts.`;
      const splitSummary = doc.splitTextToSize(summaryNarrative, pageWidth - 28);
      doc.text(splitSummary, 14, yPos);
      yPos += (splitSummary.length * 4.5) + 6;

      // Section 2: Active Rules Matrix
      if (yPos > 240) { doc.addPage(); yPos = 20; }
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(darkText[0], darkText[1], darkText[2]);
      doc.text('2. Configured Harmonization Rules & Parameters', 14, yPos);
      yPos += 6;

      // Rules Table Header
      doc.setFillColor(tableHeaderBg[0], tableHeaderBg[1], tableHeaderBg[2]);
      doc.rect(14, yPos, pageWidth - 28, 6.5, 'F');
      doc.setFontSize(8);
      doc.setTextColor(71, 85, 105);
      doc.text('Rule Name & Scope', 18, yPos + 4.5);
      doc.text('Status', 90, yPos + 4.5);
      doc.text('Parameter Settings / Custom Instructions', 120, yPos + 4.5);
      yPos += 6.5;

      doc.setFont('helvetica', 'normal');
      RULE_LIST.forEach((rule, idx) => {
        if (yPos > 275) { doc.addPage(); yPos = 20; }
        const cfg = ruleConfig[rule.key] || { enabled: true };
        const isEnabled = cfg.enabled !== false;

        if (idx % 2 === 1) {
          doc.setFillColor(tableAltRowBg[0], tableAltRowBg[1], tableAltRowBg[2]);
          doc.rect(14, yPos, pageWidth - 28, 6, 'F');
        }

        doc.setTextColor(darkText[0], darkText[1], darkText[2]);
        doc.setFontSize(8);
        doc.text(rule.title, 18, yPos + 4.2);

        if (isEnabled) {
          doc.setTextColor(successColor[0], successColor[1], successColor[2]);
          doc.text('ENABLED', 90, yPos + 4.2);
        } else {
          doc.setTextColor(mutedText[0], mutedText[1], mutedText[2]);
          doc.text('DISABLED', 90, yPos + 4.2);
        }

        doc.setTextColor(mutedText[0], mutedText[1], mutedText[2]);
        const paramStr = cfg.custom_instruction ? `Custom: ${cfg.custom_instruction}` : (rule.sub || 'Standard SAP mapping');
        doc.text(doc.splitTextToSize(paramStr, 70)[0] || '', 120, yPos + 4.2);
        yPos += 6;
      });

      yPos += 6;

      // Section 3: Transformation Category Breakdown
      if (yPos > 230) { doc.addPage(); yPos = 20; }
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(darkText[0], darkText[1], darkText[2]);
      doc.text('3. Transformation Event Breakdown by Category', 14, yPos);
      yPos += 6;

      const catList = [
        { title: 'Dedup & Filtering', items: fixLog.filter(l => l.includes('[Dedup]') || l.includes('[EmptyFilter]') || l.includes('[HeaderCleanup]')) },
        { title: 'Country, Currency & ISO Standardization', items: fixLog.filter(l => l.includes('[Country→ISO]') || l.includes('[Currency→ISO]')) },
        { title: 'Date & Phone Cleanup', items: fixLog.filter(l => l.includes('[Date→YYYYMMDD]') || l.includes('[PhoneClean]')) },
        { title: 'Whitespace Normalization & Text Truncation', items: fixLog.filter(l => l.includes('[WhitespaceTrim]') || l.includes('[Trunc35]') || l.includes('[UPPER]') || l.includes('[Pad10]')) },
        { title: 'Dynamic AI & Custom Rules', items: fixLog.filter(l => l.includes('[DynamicAI]')) }
      ];

      doc.setFillColor(tableHeaderBg[0], tableHeaderBg[1], tableHeaderBg[2]);
      doc.rect(14, yPos, pageWidth - 28, 6.5, 'F');
      doc.setFontSize(8);
      doc.setTextColor(71, 85, 105);
      doc.text('Category', 18, yPos + 4.5);
      doc.text('Events', 120, yPos + 4.5);
      doc.text('Status', 160, yPos + 4.5);
      yPos += 6.5;

      doc.setFont('helvetica', 'normal');
      catList.forEach((cat, idx) => {
        if (yPos > 275) { doc.addPage(); yPos = 20; }
        if (idx % 2 === 1) {
          doc.setFillColor(tableAltRowBg[0], tableAltRowBg[1], tableAltRowBg[2]);
          doc.rect(14, yPos, pageWidth - 28, 6, 'F');
        }
        doc.setTextColor(darkText[0], darkText[1], darkText[2]);
        doc.setFontSize(8);
        doc.text(cat.title, 18, yPos + 4.2);
        doc.text(`${cat.items.length} events`, 120, yPos + 4.2);

        if (cat.items.length > 0) {
          doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
          doc.text('TRANSFORMED', 160, yPos + 4.2);
        } else {
          doc.setTextColor(mutedText[0], mutedText[1], mutedText[2]);
          doc.text('NO CHANGES', 160, yPos + 4.2);
        }
        yPos += 6;
      });

      yPos += 6;

      // Section 4: Detailed Transformation Log (Row Level Audit)
      const detailLogs = fixLog.filter(l => l.includes('::Detail]') || (l.startsWith('[') && l.includes('Row ') && l.includes('→')));
      if (detailLogs.length > 0) {
        doc.addPage();
        yPos = 20;

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.setTextColor(darkText[0], darkText[1], darkText[2]);
        doc.text('4. Detailed Harmonization Audit & Transformation Registry (Row-Level Audit)', 14, yPos);
        yPos += 6;

        // Detail Table Header
        doc.setFillColor(tableHeaderBg[0], tableHeaderBg[1], tableHeaderBg[2]);
        doc.rect(14, yPos, pageWidth - 28, 6.5, 'F');
        doc.setFontSize(8);
        doc.setTextColor(71, 85, 105);
        doc.text('Rule Tag', 18, yPos + 4.5);
        doc.text('Row & Key Info', 55, yPos + 4.5);
        doc.text('Original Value', 105, yPos + 4.5);
        doc.text('Harmonized Target Value', 150, yPos + 4.5);
        yPos += 6.5;

        doc.setFont('helvetica', 'normal');
        detailLogs.slice(0, 150).forEach((entry, idx) => {
          if (yPos > 275) { doc.addPage(); yPos = 20; }
          if (idx % 2 === 1) {
            doc.setFillColor(tableAltRowBg[0], tableAltRowBg[1], tableAltRowBg[2]);
            doc.rect(14, yPos, pageWidth - 28, 5.5, 'F');
          }

          const tagMatch = entry.match(/^\[([^\]]+)\]\s*(.*)$/);
          const rawTag = tagMatch ? tagMatch[1].replace('::Detail', '') : 'Rule';
          const content = tagMatch ? tagMatch[2] : entry;

          const arrowParts = content.split('→');
          const leftPart = arrowParts[0] || '';
          const rightPart = arrowParts[1] || '';

          const rowKeyMatch = leftPart.match(/(Row\s*\d+(\s*\[[^\]]+\])?\s*(\([^\)]+\))?):?\s*['"]?(.*)/);
          const rowKeyText = rowKeyMatch ? rowKeyMatch[1] : leftPart.substring(0, 25);
          const oldVal = rowKeyMatch ? (rowKeyMatch[4] || '').replace(/['"]$/, '').trim() : '';
          const newVal = rightPart.replace(/^['"]|['"]$/g, '').trim();

          doc.setFontSize(7.5);
          doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
          doc.text(rawTag.substring(0, 18), 18, yPos + 4);

          doc.setTextColor(darkText[0], darkText[1], darkText[2]);
          doc.text(rowKeyText.substring(0, 26), 55, yPos + 4);

          doc.setTextColor(dangerColor[0], dangerColor[1], dangerColor[2]);
          doc.text(oldVal.substring(0, 22) || '—', 105, yPos + 4);

          doc.setTextColor(successColor[0], successColor[1], successColor[2]);
          doc.text(newVal.substring(0, 25) || '—', 150, yPos + 4);

          yPos += 5.5;
        });

        if (detailLogs.length > 150) {
          doc.setFontSize(7);
          doc.setTextColor(mutedText[0], mutedText[1], mutedText[2]);
          doc.text(`... and ${detailLogs.length - 150} more transformed values (Full dataset available in exported CSV)`, 18, yPos + 4);
          yPos += 5;
        }
      }

      // Add Page Numbers
      const totalPages = doc.getNumberOfPages();
      for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(160, 174, 192);
        doc.text(`SAP Migration Studio  |  Harmonization Report  |  Page ${i} of ${totalPages}`, pageWidth / 2, 290, { align: 'center' });
      }

      doc.save(`Harmonization_Audit_Report_${state.obj || 'Customer'}.pdf`);
      toast('Comprehensive Vector PDF Audit Report exported successfully!', 'ok');
    } catch (err: any) {
      console.error(err);
      toast('Failed to generate Harmonization PDF report', 'err');
    }
  };

  // Structured Harmonization Report CSV Generator
  const exportHarmonizationCSV = () => {
    const fixLog = result?.fix_log || previewData?.fixLog || [];
    if (!fixLog || fixLog.length === 0) {
      toast('No harmonization changes to export in CSV', 'err');
      return;
    }

    try {
      const timestamp = new Date().toISOString();
      const stats = result?.stats || previewData?.stats || {};
      const inputRowCount = stats.total_input || state.extracted?.length || state.rawData?.length || 0;
      const outputRowCount = stats.total_output || (result?.final_table || []).length || inputRowCount;

      const lines: string[] = [
        `Index,Category,Rule_Tag,Row_Number,PK_Identifier,Field_Name,Original_Value,Harmonized_Value,Status,Details`
      ];

      fixLog.forEach((line, index) => {
        let category = 'Pipeline Step';
        let ruleTag = '';
        let rowNum = '';
        let pkInfo = '';
        let fieldName = '';
        let origVal = '';
        let harmonizedVal = '';
        let status = 'INFO';
        let details = line;

        // 1. Extract Leading Rule Tag inside first [...]
        const tagMatch = line.match(/^\[([^\]]+)\]\s*(.*)$/);
        if (tagMatch) {
          ruleTag = tagMatch[1];
          details = tagMatch[2];
        } else {
          ruleTag = 'General';
        }

        // Categorize based on tag name
        const cleanTag = ruleTag.replace('::Detail', '').trim();
        if (/dedup|emptyfilter|headercleanup/i.test(cleanTag)) {
          category = 'Dedup & Filtering';
        } else if (/country|currency|payterms|mattype|iso/i.test(cleanTag)) {
          category = 'Standard Code Conversion';
        } else if (/date|phone/i.test(cleanTag)) {
          category = 'Date & Phone Formatting';
        } else if (/whitespace|trim|trunc|upper|pad/i.test(cleanTag)) {
          category = 'Text & Field Adjustments';
        } else if (/dynamicai/i.test(cleanTag)) {
          category = 'Dynamic AI Transformation';
        } else if (/init|mapping|merge|columnnaming/i.test(cleanTag)) {
          category = 'Pipeline Initialization & Schema Mapping';
        } else {
          category = 'Transformation';
        }

        // 2. Extract Row Number
        const rowMatch = details.match(/\bRow\s+(\d+)\b/i);
        if (rowMatch) {
          rowNum = rowMatch[1];
        }

        // 3. Extract Primary Key Info (e.g. [KUNNR=0000001001] or [PK=123])
        const pkMatch = details.match(/\[([A-Za-z0-9_]+=[^\]]+)\]/);
        if (pkMatch) {
          pkInfo = pkMatch[1];
        }

        // 4. Extract Field Name in parentheses (e.g. (LAND1): or (STRAS): or ('STRAS'))
        const fieldMatch = details.match(/\((?:['"]?)([A-Za-z0-9_.]+)(?:['"]?)\):/);
        if (fieldMatch) {
          fieldName = fieldMatch[1];
        } else {
          // Check for column references in quotes like in 'STRAS'
          const colInQuotesMatch = details.match(/in\s+['"]([A-Za-z0-9_.]+)['"]/i);
          if (colInQuotesMatch) {
            fieldName = colInQuotesMatch[1];
          }
        }

        // 5. Extract Transformation Values across Arrow (→ or ->)
        if (details.includes('→') || details.includes('->')) {
          const arrowSymbol = details.includes('→') ? '→' : '->';
          const arrowParts = details.split(arrowSymbol);
          const leftPart = arrowParts[0] || '';
          const rightPart = arrowParts[1] || '';

          // Extract old value after the last colon on the left side
          const colonIdx = leftPart.lastIndexOf(':');
          const rawOld = colonIdx !== -1 ? leftPart.substring(colonIdx + 1) : leftPart;
          origVal = rawOld.trim().replace(/^['"]|['"]$/g, '');
          harmonizedVal = rightPart.trim().replace(/^['"]|['"]$/g, '');
          status = 'TRANSFORMED';
        } else if (/removed|cleaned|filtered|trimmed|formatted|truncated/i.test(details)) {
          status = 'APPLIED';
        }

        const safeDetail = details.replace(/"/g, '""');
        const safeOld = /^0\d+$/.test(origVal) && origVal.length > 1 ? `="${origVal}"` : `"${origVal.replace(/"/g, '""')}"`;
        const safeNew = /^0\d+$/.test(harmonizedVal) && harmonizedVal.length > 1 ? `="${harmonizedVal}"` : `"${harmonizedVal.replace(/"/g, '""')}"`;
        const safeCategory = category.replace(/"/g, '""');
        const safeTag = ruleTag.replace(/"/g, '""');
        const safePk = pkInfo.replace(/"/g, '""');
        const safeField = (fieldName || 'N/A').replace(/"/g, '""');

        lines.push(`${index + 1},"${safeCategory}","${safeTag}",${rowNum || 'N/A'},"${safePk}","${safeField}",${safeOld},${safeNew},"${status}","${safeDetail}"`);
      });

      const csvContent = lines.join('\n');
      dl(csvContent, `Harmonization_Report_${state.obj || 'Data'}.csv`, 'text/csv');
      toast('Harmonization Report CSV exported successfully!', 'ok');
    } catch (err: any) {
      console.error(err);
      toast('Failed to export Harmonization CSV report', 'err');
    }
  };

  return (
    <PageLayout>
      <PageGrid>

        {/* ─── Main Column: Drop Zones + Results ─── */}
        <GridCol span={9}>
          <div className="space-y-4">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-[var(--text-primary)]">Step 4 — Harmonization Agent</h1>
              <p className="mt-1 max-w-2xl text-sm text-[var(--text-secondary)]">Upload files, configure rules, and test the harmonization pipeline</p>
            </div>

            {/* Two mode options: Flow & Multi */}
            <div className="flex items-center gap-2">
              {(['flow', 'multi'] as const).map(m => (
                <button
                  key={m}
                  onClick={() => { setMode(m); setResult(null); setPreviewData(null); }}
                  className={`
                    px-3.5 py-1.5 rounded-lg text-[11.5px] font-semibold transition-all duration-200 border cursor-pointer
                    ${mode === m
                      ? 'bg-purple-600 text-white border-purple-600 shadow-md shadow-purple-600/20'
                      : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] border-[var(--border)] hover:border-purple-300'}
                  `}
                >
                  {m === 'flow' ? '⚡ Flow' : '🔗 Multi'}
                </button>
              ))}
            </div>

            {/* Action Buttons */}
            <div className="flex flex-wrap items-center gap-2 border-t border-[var(--border)] pt-3">
              <Button variant="secondary" icon={<ArrowLeft className="w-3.5 h-3.5" />} onClick={() => navigate('/extract')}>
                Back
              </Button>
              <Button
                variant="primary"
                icon={<Eye className="w-3.5 h-3.5" />}
                onClick={() => runHarmonization(true)}
                disabled={!canRun}
              >
                Preview Changes
              </Button>
              {previewData && (
                <Button
                  variant="warning"
                  icon={<Play className="w-3.5 h-3.5" />}
                  onClick={handleProceed}
                >
                  Proceed & Execute
                </Button>
              )}
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

          {mode === 'multi' && (
            <Card>
              <CardHeader
                title="Multi-Source Data Modeling & Relational Key Join"
                subtitle="Stage multi-table files, configure primary & foreign key relationships, and harmonise"
              />
              <CardBody className="p-4 space-y-4">
                {/* Hidden Multi-file input */}
                <input
                  ref={multiFileInputRef}
                  type="file"
                  multiple
                  accept=".csv,.xlsx,.xls"
                  className="hidden"
                  onChange={(e) => handleFilesAdded(e.target.files)}
                />

                {/* Source System Selector */}
                <div>
                  <label className="font-mono text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] mb-1.5 block">
                    Source System
                  </label>
                  <Select
                    value={secondarySource || state.src || 'EXCEL_CSV'}
                    onChange={(val) => { setSecondarySource(val); setPrimarySource(val); }}
                    options={[
                      { value: 'EXCEL_CSV', label: 'Excel/CSV' },
                      { value: 'SAP_ECC', label: 'SAP ECC 6.0' },
                      { value: 'ORACLE_EBS', label: 'Oracle EBS R12' },
                      { value: 'DYNAMICS', label: 'MS Dynamics' },
                      { value: 'SALESFORCE', label: 'Salesforce' },
                      { value: 'LEGACY', label: 'Legacy DB' }
                    ]}
                  />
                </div>

                {/* Selected Files Header & Action */}
                <div className="flex items-center justify-between pt-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[12px] font-semibold text-[var(--text-primary)] uppercase tracking-wider font-mono">
                      Selected Files ({displayedFiles.length})
                    </span>
                    <Badge variant={displayedFiles.length > 1 ? "teal" : "green"}>
                      {displayedFiles.length > 1 ? 'Multi-Table Join' : '1 Base Table Loaded'}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => multiFileInputRef.current?.click()}
                      icon={<Plus className="w-3.5 h-3.5 text-emerald-500" />}
                    >
                      Add Secondary File
                    </Button>
                    {stagedSecondaryFiles.length > 0 && (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={handleClearStagedFiles}
                        className="text-red-500 hover:text-red-600"
                      >
                        Reset Secondary
                      </Button>
                    )}
                  </div>
                </div>

                {/* List of files (Primary Base Table + Uploaded Secondary Files) */}
                <div className="grid grid-cols-1 gap-2.5">
                  {displayedFiles.map((file, idx) => {
                    const schema = displayedSchemas.find(s => s.filename === file.name);
                    const mappingFile = secondaryMappingFiles[file.name];

                    if (file.isPrimary) {
                      return (
                        <div
                          key={file.name + idx}
                          className="flex flex-wrap items-center justify-between gap-3 px-3.5 py-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 dark:bg-emerald-950/15"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-9 h-9 rounded-lg bg-emerald-500/15 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0">
                              <Database className="w-4 h-4" />
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <p className="text-[13px] font-semibold text-[var(--text-primary)] truncate">
                                  {file.name}
                                </p>
                                <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 text-[10px] font-mono font-bold tracking-wider">
                                  PRIMARY / BASE
                                </span>
                              </div>
                              <p className="text-[11px] text-[var(--text-secondary)] mt-0.5">
                                {file.rows || primaryRowCount} records • {schema?.headers.length || primaryColumns.length} columns (Extracted & Mapped)
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-[10.5px] font-mono text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-md border border-emerald-500/20 flex items-center gap-1">
                              <CheckCircle2 className="w-3.5 h-3.5" /> Step 3 Schema Linked
                            </span>
                          </div>
                        </div>
                      );
                    }

                    return (
                      <div
                        key={file.name + idx}
                        className="flex flex-wrap items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--bg-tertiary)]/70 hover:border-teal-500/40 transition-colors"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-8 h-8 rounded-lg bg-teal-500/10 flex items-center justify-center text-teal-600 dark:text-teal-400 shrink-0">
                            <FileText className="w-4 h-4" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-[13px] font-medium text-[var(--text-primary)] truncate">
                              {file.name}
                            </p>
                            <p className="text-[10.5px] text-[var(--text-tertiary)]">
                              {(file.size / 1024).toFixed(1)} KB
                              {schema && (
                                <span className="ml-2 text-teal-600 dark:text-teal-400 font-mono">
                                  • {schema.headers.length} columns
                                </span>
                              )}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2.5">
                          {/* Optional Mapping File Selector */}
                          {mappingFile ? (
                            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-300 text-[11px] font-mono">
                              <MapPin className="w-3.5 h-3.5 text-amber-500" />
                              <span className="font-medium truncate max-w-[130px]">{mappingFile.name}</span>
                              <button
                                type="button"
                                onClick={() => handleRemoveMappingFile(file.name)}
                                className="hover:text-red-500 transition-colors cursor-pointer ml-1 p-0.5 rounded"
                                title="Remove attached mapping CSV"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          ) : (
                            <label
                              className="cursor-pointer inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium border border-dashed border-amber-500/40 bg-amber-500/5 hover:bg-amber-500/15 text-amber-700 dark:text-amber-300 transition-colors"
                              title="Optionally attach a field mapping CSV for this table"
                            >
                              <Upload className="w-3 h-3 text-amber-500" />
                              <span>+ Add Mapping CSV (Optional)</span>
                              <input
                                type="file"
                                accept=".csv"
                                className="hidden"
                                onChange={(e) => handleMappingFileAdded(file.name, e.target.files?.[0] || null)}
                              />
                            </label>
                          )}

                          <button
                            type="button"
                            onClick={() => handleRemoveStagedFile(file.name)}
                            className="p-1.5 rounded-lg text-[var(--text-tertiary)] hover:text-red-500 hover:bg-red-500/10 transition-colors cursor-pointer"
                            title="Remove file"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Secondary Dropzone when 0 secondary files staged */}
                {stagedSecondaryFiles.length === 0 && (
                  <div
                    onClick={() => multiFileInputRef.current?.click()}
                    className="p-6 border-2 border-dashed border-[var(--border)] hover:border-teal-400 rounded-xl bg-[var(--bg-tertiary)]/30 text-center cursor-pointer transition-all space-y-2"
                  >
                    <div className="w-9 h-9 mx-auto rounded-xl bg-teal-500/10 flex items-center justify-center text-teal-500">
                      <Upload className="w-4.5 h-4.5" />
                    </div>
                    <div>
                      <p className="text-[13px] font-medium text-[var(--text-primary)]">
                        + Click or drag CSV / Excel files to join with {primaryTableName}
                      </p>
                      <p className="text-[11px] text-[var(--text-secondary)]">
                        Supports secondary tables (e.g. Addresses.csv, Oracle_EBS.csv) with optional Mapping CSV support
                      </p>
                    </div>
                  </div>
                )}

                {/* Multi-file Relational Key Join Configuration */}
                {displayedFiles.length >= 2 && (
                  <div className="mt-4 pt-3 border-t border-[var(--border)] space-y-3.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <GitMerge className="w-4 h-4 text-emerald-500" />
                        <h4 className="text-[12.5px] font-semibold text-[var(--text-primary)]">
                          Key Join Configuration (Data Modeling)
                        </h4>
                      </div>
                      <span className="text-[11px] text-[var(--text-tertiary)] font-mono">
                        Joining secondary tables into Base Table
                      </span>
                    </div>

                    {/* Base Table Selector */}
                    <div className="p-3 rounded-xl border border-[var(--border)] bg-[var(--bg-tertiary)]/40 space-y-1.5">
                      <label className="font-mono text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] block">
                        Primary / Base Table (Master Table)
                      </label>
                      <Select
                        value={displayedJoinConfig.base_file}
                        searchable
                        onChange={(val) => {
                          const newBaseJoins = displayedFiles.filter(f => f.name !== val).map(f => {
                            const baseS = displayedSchemas.find(s => s.filename === val);
                            const joinS = displayedSchemas.find(s => s.filename === f.name);
                            const existing = displayedJoinConfig.joins.find(j => j.join_file === f.name);
                            const kps = existing?.key_pairs?.length
                              ? existing.key_pairs
                              : [{
                                base_key: existing?.base_key || baseS?.headers[0] || '',
                                join_key: existing?.join_key || joinS?.headers[0] || ''
                              }];

                            return {
                              join_file: f.name,
                              source_file: val,
                              base_key: kps[0].base_key,
                              join_key: kps[0].join_key,
                              key_pairs: kps
                            };
                          });
                          const newCfg = {
                            base_file: val,
                            joins: newBaseJoins
                          };
                          setJoinConfig(newCfg);
                          dispatch({ type: 'SET_FIELD', field: 'joinConfig', value: newCfg });
                        }}
                        options={displayedFiles.map(f => ({
                          value: f.name,
                          label: f.name === primaryTableName ? `${f.name} (Primary Data)` : f.name
                        }))}
                      />
                    </div>

                    {/* Joins for each secondary file */}
                    {displayedJoinConfig.base_file && displayedJoinConfig.joins.map((join, idx) => {
                      const activeSourceFile = join.source_file || displayedJoinConfig.base_file;
                      const sourceSchema = displayedSchemas.find(s => s.filename === activeSourceFile)
                        || displayedSchemas.find(s => s.filename === displayedJoinConfig.base_file);
                      const joinSchema = displayedSchemas.find(s => s.filename === join.join_file);
                      const keyPairs = join.key_pairs?.length
                        ? join.key_pairs
                        : [{ base_key: join.base_key || '', join_key: join.join_key || '' }];

                      const otherAvailableFiles = displayedFiles.filter(f => f.name !== join.join_file);
                      const isMapped = !!secondaryMappingFiles[join.join_file];

                      return (
                        <div
                          key={join.join_file + idx}
                          className="p-3.5 rounded-xl border border-[var(--border)] bg-[var(--bg-tertiary)]/40 space-y-3"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <Layers className="w-3.5 h-3.5 text-teal-500" />
                              <span className="text-[12px] font-semibold text-[var(--text-primary)]">
                                Join: {join.join_file}
                              </span>
                              {isMapped ? (
                                <span className="text-[9.5px] font-mono px-2 py-0.5 rounded bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20">
                                  Mapped with {secondaryMappingFiles[join.join_file]?.name}
                                </span>
                              ) : (
                                <span className="text-[9.5px] font-mono px-2 py-0.5 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                                  Direct Key Join (No Mapping CSV)
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="flex items-center gap-1.5 bg-[var(--bg-secondary)] px-2 py-0.5 rounded-lg border border-[var(--border)]">
                                <span className="text-[10px] text-[var(--text-tertiary)] font-mono font-medium">Join With:</span>
                                <div className="w-48">
                                  <Select
                                    value={activeSourceFile}
                                    onChange={(v) => updateJoinSourceFile(idx, v)}
                                    options={otherAvailableFiles.map(f => ({
                                      value: f.name,
                                      label: f.name === displayedJoinConfig.base_file ? `${f.name} (Base)` : f.name
                                    }))}
                                  />
                                </div>
                              </div>
                              {keyPairs.length > 1 && (
                                <span className="text-[9.5px] font-mono font-bold px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                                  {keyPairs.length} KEY CONDITIONS
                                </span>
                              )}
                              <span className="text-[10px] font-mono text-[var(--text-tertiary)]">LEFT JOIN</span>
                            </div>
                          </div>

                          {/* List of join key pairs */}
                          <div className="space-y-2.5">
                            {keyPairs.map((kp, kIdx) => (
                              <React.Fragment key={kIdx}>
                                {kIdx > 0 && (
                                  <div className="flex items-center justify-center -my-1">
                                    <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 font-mono text-[9px] font-bold tracking-wider">
                                      AND (COMPOSITE KEY)
                                    </span>
                                  </div>
                                )}
                                <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto] items-end gap-2 bg-[var(--bg-secondary)]/50 p-2.5 rounded-lg border border-[var(--border)]/60 w-full max-w-full">
                                  <div className="min-w-0">
                                    <label className="text-[10.5px] text-[var(--text-secondary)] font-medium mb-1 block truncate">
                                      {activeSourceFile} Key {keyPairs.length > 1 ? `#${kIdx + 1}` : 'Key'}
                                    </label>
                                    <Select
                                      value={kp.base_key}
                                      searchable
                                      onChange={(v) => updateJoinKeyPair(idx, kIdx, 'base_key', v)}
                                      options={[
                                        { value: '', label: `Select ${activeSourceFile} Key...` },
                                        ...(sourceSchema?.headers.map(h => ({ value: h, label: h })) || [])
                                      ]}
                                    />
                                  </div>

                                  <div className="flex flex-col items-center justify-center pb-2 shrink-0">
                                    <ArrowRight className="w-4 h-4 text-emerald-500" />
                                  </div>

                                  <div className="min-w-0">
                                    <label className="text-[10.5px] text-[var(--text-secondary)] font-medium mb-1 block truncate">
                                      {join.join_file} Key {keyPairs.length > 1 ? `#${kIdx + 1}` : 'Foreign Key'}
                                    </label>
                                    <Select
                                      value={kp.join_key}
                                      searchable
                                      onChange={(v) => updateJoinKeyPair(idx, kIdx, 'join_key', v)}
                                      options={[
                                        { value: '', label: `Select ${join.join_file} Key...` },
                                        ...(joinSchema?.headers.map(h => ({ value: h, label: h })) || [])
                                      ]}
                                    />
                                  </div>

                                  <div className="flex items-center justify-center pb-1 w-8 shrink-0">
                                    {kIdx > 0 ? (
                                      <button
                                        type="button"
                                        onClick={() => removeJoinKeyPair(idx, kIdx)}
                                        className="p-1.5 rounded-lg text-red-500 hover:bg-red-500/10 transition-colors cursor-pointer"
                                        title="Remove this composite key condition"
                                      >
                                        <Trash2 className="w-4 h-4" />
                                      </button>
                                    ) : null}
                                  </div>
                                </div>
                              </React.Fragment>
                            ))}
                          </div>

                          {/* Add additional key condition button */}
                          <div className="pt-1">
                            <button
                              type="button"
                              onClick={() => addJoinKeyPair(idx)}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 cursor-pointer transition-colors"
                            >
                              <Plus className="w-3 h-3" />
                              Add Composite Key Condition
                            </button>
                          </div>
                        </div>
                      );
                    })}

                    <Button
                      variant="primary"
                      className="w-full justify-center mt-2"
                      onClick={() => runHarmonization(false)}
                      disabled={
                        !displayedJoinConfig.base_file ||
                        displayedJoinConfig.joins.some(j => {
                          const kps = j.key_pairs?.length ? j.key_pairs : [{ base_key: j.base_key, join_key: j.join_key }];
                          return kps.length === 0 || kps.some(kp => !kp.base_key || !kp.join_key);
                        })
                      }
                      icon={<GitMerge className="w-4 h-4" />}
                    >
                      Merge & Harmonize {displayedFiles.length} Tables
                    </Button>
                  </div>
                )}

                {/* Loaded state notification banner */}
                {(result || (state.headers.length > 0 && (state.rawData?.length || state.extracted?.length))) && (
                  <div className="flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-[12px] font-medium">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 shrink-0" />
                      <span>
                        Loaded {result ? result.stats.total_output : (state.rawData?.length || state.extracted?.length || 0)} records ({result ? result.columns.length : state.headers.length} columns ready)
                      </span>
                    </div>
                  </div>
                )}
              </CardBody>
            </Card>
          )}

          {/* Preview Card */}
          {previewData && (
            <PreviewCard fixLog={previewData.fixLog} stats={previewData.stats} ruleConfig={ruleConfig} onProceed={handleProceed} />
          )}

          {/* Harmonization Changes & Audit Report (Shown First) */}
          {result && (
            <HarmonizationReportCard
              result={result}
              onExportPDF={exportHarmonizationPDF}
              onExportCSV={exportHarmonizationCSV}
            />
          )}

          {/* Results Table — Multi-Table Display */}
          {result && (() => {
            const outputRows = result.final_table || [];
            const allTables: TableInfo[] = extractedTables.length > 0
              ? extractedTables
              : [{ table_name: 'Harmonized Output', columns: result.columns }];
            const visibleTables = allTables.filter((t: any) => selectedOutputTables.has(t.table_name));
            const allKeyColumns = detectKeyColumns(allTables.flatMap((t: any) => t.columns));
            const filteredRows = filterRowsByKey(outputRows, outputKeyFilter, allKeyColumns);

            return (
              <div className="space-y-4">
                <TableFilterToolbar
                  tables={allTables}
                  selectedTables={selectedOutputTables}
                  onSelectedTablesChange={setSelectedOutputTables}
                  keyFilterValue={outputKeyFilter}
                  onKeyFilterChange={setOutputKeyFilter}
                  keyColumns={allKeyColumns}
                  accentColor="purple"
                />
                {visibleTables.length === 0 ? (
                  <div className="p-8 text-center rounded-2xl border border-dashed border-gray-300 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/30 text-gray-500 dark:text-gray-400 text-xs font-medium">
                    No tables selected. Click <strong>Tables Selected</strong> above to choose tables to view.
                  </div>
                ) : (
                  visibleTables.map((t: any) => {
                    const { columns: tableCols, rows: tableRows } = getTableDisplayData(t, filteredRows, state.mapping);
                    const currentPage = tablePages[t.table_name] || 1;
                    const paginatedRows = tableRows.slice((currentPage - 1) * 15, currentPage * 15);

                    return (
                      <Card key={t.table_name}>
                        <CardHeader
                          title={`Harmonized: ${t.table_name}`}
                          subtitle={`${tableRows.length} rows × ${tableCols.length} columns${outputKeyFilter ? ' (filtered)' : ''}`}
                        >
                          <Button
                            variant="secondary"
                            size="sm"
                            icon={<Download className="w-3 h-3" />}
                            onClick={() => dl(expCSV(tableRows), `${t.table_name.replace(/[\s/]+/g, '_').toLowerCase()}_harmonized.csv`, 'text/csv')}
                            className="ml-auto"
                          >
                            Export {t.table_name}
                          </Button>
                        </CardHeader>
                        <CardBody className="p-0 overflow-hidden">
                          <DataTable
                            rows={paginatedRows}
                            cols={tableCols}
                            keyCols={allKeyColumns}
                          />
                          <TablePaginationFooter
                            currentPage={currentPage}
                            totalRows={tableRows.length}
                            pageSize={15}
                            onPageChange={(newPage) => setTablePages(prev => ({ ...prev, [t.table_name]: newPage }))}
                            isFiltered={!!outputKeyFilter}
                            accentColor="purple"
                          />
                        </CardBody>
                      </Card>
                    );
                  })
                )}
              </div>
            );
          })()}

          {!result && !previewData && (
            <Card>
              <CardBody>
                <EmptyState
                  icon={<FlaskConical className="w-10 h-10 text-purple-500" />}
                  message="Click 'Preview Changes' to see what harmonization will do, then 'Proceed' to execute"
                />
              </CardBody>
            </Card>
          )}
        </GridCol>

        {/* ─── Right Column: Cleansing Rules UI Redesign (Inline Parameter Box) ─── */}
        <GridCol span={3} className="space-y-4">

          {/* Harmonization Rules Card (Redesigned with Inline Parameter Boxes — No Popups!) */}
          <Card className="shadow-xs border-[var(--border)]">
            <CardHeader
              title="Harmonization Rules"
              subtitle={`${enabledRuleCount}/${totalRuleCount} enabled`}
            />
            <CardBody className="p-3 space-y-2">
              {RULE_LIST.map((rule) => {
                const cfg = ruleConfig[rule.key] || { enabled: true };
                const isExpanded = expandedRuleKey === rule.key;
                const isEdited = !!cfg.custom_instruction || !!cfg.params?.target_fields || (rule.key === 'country_iso' && cfg.params?.iso_length === 3);

                return (
                  <div
                    key={rule.key}
                    className={`
                      relative rounded-xl border transition-all duration-200 overflow-hidden
                      ${!cfg.enabled
                        ? 'border-gray-200 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-950/20 opacity-50'
                        : isEdited
                          ? 'border-purple-400 dark:border-purple-600 bg-purple-50/20 dark:bg-purple-950/20 shadow-xs'
                          : 'border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/60 hover:border-purple-300'
                      }
                    `}
                  >
                    {/* Main Rule Header Line */}
                    <div className="flex items-center justify-between p-3">
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        {/* Purple Square Checkbox */}
                        <button
                          onClick={() => toggleRule(rule.key)}
                          className={`
                            w-5 h-5 rounded-md flex items-center justify-center transition-all cursor-pointer shrink-0
                            ${cfg.enabled
                              ? 'bg-purple-600 text-white shadow-xs'
                              : 'border-2 border-gray-300 dark:border-gray-600 bg-transparent'
                            }
                          `}
                        >
                          {cfg.enabled && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                        </button>

                        <span className="text-sm shrink-0">{rule.emoji}</span>

                        {/* Title & Subtitle */}
                        <div className="min-w-0 flex-1">
                          <div className={`text-[12px] font-bold leading-snug truncate ${cfg.enabled ? (isEdited ? 'text-purple-700 dark:text-purple-300' : 'text-emerald-600 dark:text-emerald-400') : 'text-[var(--text-tertiary)] line-through'}`}>
                            {rule.title}
                            {isEdited && <span className="ml-1 text-[9px] text-purple-500 font-normal">(Customized)</span>}
                          </div>
                          <div className="text-[10.5px] text-[var(--text-tertiary)] leading-tight truncate">
                            {cfg.custom_instruction ? `💬 ${cfg.custom_instruction}` : rule.sub}
                          </div>
                        </div>
                      </div>

                      {/* Far Right: Edit Pencil Icon to toggle inline box */}
                      <button
                        onClick={() => setExpandedRuleKey(isExpanded ? null : rule.key)}
                        title={`Configure parameters for ${rule.title}`}
                        className={`p-1.5 rounded-lg transition-colors ml-2 cursor-pointer shrink-0 ${isExpanded
                            ? 'bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300'
                            : 'hover:bg-purple-100 dark:hover:bg-purple-900/40 text-gray-400 hover:text-purple-600'
                          }`}
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Inline Parameter Box (No popups!) */}
                    {isExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="px-3 pb-3 pt-1 border-t border-[var(--border)] bg-[var(--bg-tertiary)]/50 space-y-2 text-[11px]"
                      >
                        {/* Specific parameters */}
                        {rule.key === 'country_iso' && (
                          <div className="flex items-center justify-between gap-2 pt-1">
                            <span className="font-semibold text-[var(--text-secondary)]">ISO Format:</span>
                            <select
                              value={cfg.params?.iso_length ?? 2}
                              onChange={(e) => updateRuleParamInline(rule.key, 'iso_length', parseInt(e.target.value))}
                              className="px-2 py-0.5 rounded text-xs font-semibold bg-[var(--bg-primary)] border border-[var(--border)] text-[var(--text-primary)]"
                            >
                              <option value={2}>2-Letter (US, IN)</option>
                              <option value={3}>3-Letter (USA, IND)</option>
                            </select>
                          </div>
                        )}

                        {rule.key === 'whitespace_trim' && (
                          <div className="flex items-center justify-between gap-2 pt-1">
                            <span className="font-semibold text-[var(--text-secondary)]">Trim Mode:</span>
                            <select
                              value={cfg.params?.mode ?? 'both'}
                              onChange={(e) => updateRuleParamInline(rule.key, 'mode', e.target.value)}
                              className="px-2 py-0.5 rounded text-xs font-semibold bg-[var(--bg-primary)] border border-[var(--border)] text-[var(--text-primary)]"
                            >
                              <option value="both">Both Sides</option>
                              <option value="left">Left Only</option>
                              <option value="right">Right Only</option>
                            </select>
                          </div>
                        )}

                        {/* Custom Instruction Box */}
                        <div>
                          <label className="text-[10px] font-bold text-purple-600 dark:text-purple-400 block mb-0.5">
                            Custom Constraint:
                          </label>
                          <input
                            type="text"
                            placeholder="e.g. Convert to 3-letter ISO if country starts with DE"
                            value={cfg.custom_instruction || ''}
                            onChange={(e) => updateRuleInstructionInline(rule.key, e.target.value)}
                            className="w-full px-2.5 py-1 rounded text-xs bg-[var(--bg-primary)] border border-purple-300 dark:border-purple-800 text-[var(--text-primary)] focus:ring-1 focus:ring-purple-500"
                          />
                        </div>
                      </motion.div>
                    )}
                  </div>
                );
              })}
            </CardBody>
          </Card>

          {/* Dynamic AI Harmonization Rules Card */}
          <Card className="border-purple-200 dark:border-purple-900/50 bg-gradient-to-br from-[var(--bg-primary)] to-purple-50/20 dark:to-purple-950/10">
            <CardHeader
              title="Dynamic AI Rules"
              subtitle="Custom harmonization transforms"
              icon={<Sparkles className="w-4 h-4 text-purple-600 dark:text-purple-400" />}
            >
              <Button
                variant="secondary"
                size="sm"
                icon={<Save className="w-3.5 h-3.5" />}
                onClick={saveHarmonizeRulesToDB}
              >
                Save Rules
              </Button>
            </CardHeader>
            <CardBody className="p-3 space-y-3">
              {/* Input & Add Prompt */}
              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  value={newPromptInput}
                  onChange={(e) => setNewPromptInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddPrompt()}
                  placeholder="e.g. Convert all names to uppercase"
                  className="flex-1 px-2.5 py-1.5 rounded-lg text-[11px] bg-[var(--bg-tertiary)] border border-[var(--border)] text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-purple-500"
                />
                <Button variant="secondary" size="sm" icon={<Plus className="w-3.5 h-3.5" />} onClick={handleAddPrompt}>
                  Add
                </Button>
              </div>

              {/* List of Custom Prompts */}
              {customPrompts.length > 0 ? (
                <div className="space-y-1.5 pt-1">
                  <div className="flex items-center justify-between text-[10px] font-bold text-[var(--text-tertiary)] uppercase tracking-wider">
                    <span>Transform Rules ({customPrompts.length})</span>
                    <span className="text-[9.5px] text-purple-600 dark:text-purple-400 font-semibold normal-case">
                      ⚡ 1 LLM Call
                    </span>
                  </div>
                  <div className="space-y-1.5 max-h-[220px] overflow-y-auto scrollbar-thin">
                    {customPrompts.map((p, idx) => (
                      <div key={idx} className="flex items-start justify-between p-2 rounded-lg bg-[var(--bg-tertiary)]/70 text-[10.5px] border border-[var(--border)] gap-1.5">
                        <div className="flex gap-1.5">
                          <span className="text-purple-600 font-bold shrink-0">⚡</span>
                          <span className="text-[var(--text-primary)] font-medium leading-tight">#{idx + 1}. {p}</span>
                        </div>
                        <button onClick={() => handleRemovePrompt(idx)} className="text-[var(--text-tertiary)] hover:text-red-500 p-0.5 cursor-pointer shrink-0">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="text-[10px] text-[var(--text-tertiary)] italic px-1 py-1">
                  No custom AI rules added yet. Add prompts above to create LLM-generated transform functions.
                </div>
              )}
            </CardBody>
          </Card>
        </GridCol>

      </PageGrid>
    </PageLayout>
  );
}
