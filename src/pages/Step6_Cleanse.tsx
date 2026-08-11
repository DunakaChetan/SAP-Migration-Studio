import React, { useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMigration } from '@/store/migration-store';
import { useToast } from '@/components/ui/toast';
import { useLoading } from '@/components/ui/loading-overlay';
import { dl, expCSV } from '@/lib/utils';
import { PageLayout, PageGrid, GridCol, Card, CardHeader, CardBody, Button, StatBox, StatsGrid, DataTable, InfoBox, EmptyState, AIResponse } from '@/components/shared';
import {
  ArrowLeft, ArrowRight, Sparkles, Download, Bot, Upload, Save,
  ChevronDown, ChevronUp, CheckCircle2, AlertTriangle, Layers, Activity, Filter, ShieldAlert, CheckCircle
} from 'lucide-react';

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

interface CleanserSummary {
  overall_status?: string;
  rows_loaded?: number;
  rows_exported?: number;
  rows_modified_count?: number;
  rows_modified?: number[];
  dynamic_fixes?: { count?: number; items?: FixItem[] };
  validation_fixes?: { total?: number; count?: number; items?: FixItem[] };
  cleanser_fixes?: { total?: number; count?: number; items?: FixItem[] };
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

function exportFixesReport(summary: CleanserSummary): string {
  const rows = ['Phase,Rule Code,Row Number,Field Name,Original Value,Cleansed Value'];
  const addItems = (phase: string, items?: FixItem[]) => {
    (items || []).forEach((item) => {
      const cleanOld = String(item.old ?? '').replace(/"/g, "'");
      const cleanNew = String(item.new ?? '').replace(/"/g, "'");
      rows.push(`"${phase}","${item.rule_code}",${item.row},"${item.field}","${cleanOld}","${cleanNew}"`);
    });
  };
  addItems('Dynamic AI Rule', summary.dynamic_fixes?.items);
  addItems('Validation Fix', summary.validation_fixes?.items);
  addItems('Cleanser Normalization', summary.cleanser_fixes?.items);
  return rows.join('\n');
}

function renderGroupedFixesSection({
  title,
  icon,
  items,
  badgeBg,
  borderClr,
  expandedGroups,
  toggleGroup
}: {
  title: string;
  icon: string;
  items?: FixItem[];
  badgeBg: string;
  borderClr: string;
  expandedGroups: Record<string, boolean>;
  toggleGroup: (key: string) => void;
}) {
  if (!items || items.length === 0) return null;
  const groups = groupFixItems(items);

  return (
    <div className={`p-4 rounded-xl border ${borderClr} bg-[var(--bg-tertiary)]/40 space-y-3`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-[12px] font-bold text-[var(--text-primary)]">
          <span>{icon}</span>
          <span>{title}</span>
          <span className={`px-2.5 py-0.5 rounded-full text-[9.5px] font-mono font-bold ${badgeBg}`}>
            {items.length} applied · {groups.length} rule type{groups.length > 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {/* Parallel Grid Layout (No Long Scrolling) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {groups.map((group) => {
          const groupKey = `${title}::${group.rule_code}::${group.field}`;
          const isExpanded = !!expandedGroups[groupKey];
          const displayItems = isExpanded ? group.items : group.items.slice(0, 3);
          const hasMore = group.items.length > 3;

          return (
            <div key={groupKey} className="p-3 rounded-lg bg-[var(--bg-primary)] border border-[var(--border)] shadow-sm space-y-2 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between gap-2 pb-1.5 border-b border-[var(--border)] mb-2">
                  <div className="font-mono text-[11px] font-bold text-[var(--text-primary)] truncate">
                    {group.rule_code}
                  </div>
                  <span className="text-[9.5px] px-1.5 py-0.5 rounded font-mono font-bold bg-[var(--bg-tertiary)] text-[var(--text-secondary)] shrink-0 border border-[var(--border)]">
                    {group.count} {group.count === 1 ? 'row' : 'rows'}
                  </span>
                </div>
                {group.field && (
                  <div className="text-[10px] text-[var(--text-tertiary)] font-mono mb-2">
                    Field: <strong className="text-[var(--text-primary)]">{group.field}</strong>
                  </div>
                )}

                <div className="space-y-1 font-mono text-[10px]">
                  {displayItems.map((item, idx) => (
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

              {hasMore && (
                <button
                  onClick={() => toggleGroup(groupKey)}
                  className="w-full text-center text-[10px] font-bold text-violet-600 dark:text-violet-400 hover:underline pt-2 border-t border-[var(--border)] flex items-center justify-center gap-1 cursor-pointer transition-colors"
                >
                  {isExpanded ? (
                    <>Show less <ChevronUp className="w-3 h-3" /></>
                  ) : (
                    <>+ {group.items.length - 3} more affected rows <ChevronDown className="w-3 h-3" /></>
                  )}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function Step6Cleanse() {
  const { state, dispatch } = useMigration();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { showLoad, tick, hideLoad } = useLoading();
  
  const [source, setSource] = React.useState<Source>('harmonized');
  const [standaloneCsv, setStandaloneCsv] = React.useState<File | null>(null);
  const [standaloneValidationCsv, setStandaloneValidationCsv] = React.useState<File | null>(null);
  const [summary, setSummary] = React.useState<CleanserSummary | null>(null);
  const [expandedGroups, setExpandedGroups] = React.useState<Record<string, boolean>>({});
  const toggleGroup = (key: string) => setExpandedGroups(prev => ({ ...prev, [key]: !prev[key] }));
  
  const csvInputRef = useRef<HTMLInputElement>(null);
  const valCsvInputRef = useRef<HTMLInputElement>(null);

  const has = state.cleaned.length > 0;

  async function doCleanse() {
    showLoad('Cleansing…', 'Applying automated fix rules');
    [0, 1, 2, 3, 4, 5, 6, 7].forEach((i) => setTimeout(() => tick(i), 280 + i * 260));
    
    try {
      let res;
      if (source === 'harmonized') {
        if (!state.projectId || !state.obj) {
          throw new Error("Project or Object not selected.");
        }
        res = await fetch('/api/sap/cleanser/flow', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            project_id: state.projectId,
            target_object: state.obj
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

        res = await fetch('/api/sap/cleanser/upload-csv', {
          method: 'POST',
          body: formData,
        });
      }

      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.detail || 'Cleanser failed');
      
      setSummary(data.summary || null);
      
      const fixesCount = (data.summary?.dynamic_fixes?.count || 0) + (data.summary?.validation_fixes?.count || 0) + (data.summary?.cleanser_fixes?.count || 0);

      dispatch({
        type: 'BATCH_UPDATE',
        updates: {
          cleaned: data.cleaned,
          isCleansedSaved: false,
          stats: { ...state.stats, fixes: fixesCount },
        },
      });

      hideLoad();
      toast(`Cleansed ${data.cleaned.length} records · ${fixesCount} auto-fixes applied`, 'ok');
    } catch (err: any) {
      hideLoad();
      toast(err.message || 'Cleanser failed', 'err');
    }
  }

  const saveDataToDB = async () => {
    if (!state.projectId || !state.obj) {
      toast('Project or Object not selected', 'err');
      return;
    }
    
    showLoad('Saving data...', 'Persisting cleansed records to database');
    try {
      const res = await fetch('/api/sap/cleanser/save', {
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

  return (
    <PageLayout>
      <PageGrid>
        {/* Left Column */}
        <GridCol span={3}>
          <Card>
            <CardHeader title="Cleansing Rules" />
            <CardBody className="p-3 space-y-3">
              {[
                ['Trim Whitespace', 'Leading/trailing spaces'],
                ['Country→ISO', 'Full names to 2-3 char'],
                ['Currency→ISO', 'Map to ISO 4217'],
                ['PayTerms→SAP', 'Text to NT30 keys'],
                ['MatType→SAP', 'ROH/FERT/HALB/HAWA'],
                ['Pad Numeric IDs', 'KUNNR/LIFNR 10 digits'],
                ['UPPERCASE Codes', 'Org & code fields'],
                ['Clean Tax Numbers', 'Remove special chars'],
                ['Truncate Overlength', 'SAP max field length'],
                ['Fill Empty Fields', 'Set null to blank']
              ].map(([t, d]) => (
                <div key={t} className="px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--bg-tertiary)]/50">
                  <div className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400">✓ {t}</div>
                  <div className="text-[10px] text-[var(--text-tertiary)]">{d}</div>
                </div>
              ))}
            </CardBody>
          </Card>
        </GridCol>

        {/* Middle Column */}
        <GridCol span={6}>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-[var(--text-primary)]">Step 6 — AI Cleanse & Fix</h1>
            <p className="mt-1 max-w-2xl text-sm text-[var(--text-secondary)]">AI autonomously resolves validation errors based on master data context and business rules</p>
          </div>

          <div className="flex items-center gap-2 mt-4">
            <button
              onClick={() => { setSource('harmonized'); dispatch({ type: 'BATCH_UPDATE', updates: { cleaned: [], isCleansedSaved: false } }); setSummary(null); }}
              className={`
                px-3.5 py-1.5 rounded-lg text-[11.5px] font-semibold transition-all duration-200 border
                ${source === 'harmonized'
                  ? 'bg-violet-600 text-white border-violet-600 shadow-md shadow-violet-600/20'
                  : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] border-[var(--border)] hover:border-violet-300'}
              `}
            >
              ⚡ Flow
            </button>
            <button
              onClick={() => { setSource('upload'); dispatch({ type: 'BATCH_UPDATE', updates: { cleaned: [], isCleansedSaved: false } }); setSummary(null); }}
              className={`
                px-3.5 py-1.5 rounded-lg text-[11.5px] font-semibold transition-all duration-200 border
                ${source === 'upload'
                  ? 'bg-violet-600 text-white border-violet-600 shadow-md shadow-violet-600/20'
                  : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] border-[var(--border)] hover:border-violet-300'}
              `}
            >
              📄 Upload CSV
            </button>
          </div>

          {source === 'upload' && (
            <div className="flex flex-col gap-3 mt-4 border-t border-[var(--border)] pt-4 mb-2">
              <div className="flex items-center gap-2">
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
                <span className="text-[10.5px] text-[var(--text-tertiary)]">(Required)</span>
              </div>
              <div className="flex items-center gap-2">
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
                <span className="text-[10.5px] text-[var(--text-tertiary)]">(Optional)</span>
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2 border-t border-[var(--border)] pt-3 mt-4 mb-4">
            <Button variant="secondary" icon={<ArrowLeft className="w-3.5 h-3.5" />} onClick={() => navigate('/validate')}>Back</Button>
            <Button variant="cyan" icon={<Bot className="w-3.5 h-3.5" />} onClick={doCleanse} disabled={source === 'upload' && !standaloneCsv}>
              Auto-Fix with AI
            </Button>
            
            <div title={!has ? "Run cleanse first before saving." : ""}>
              <Button variant="secondary" icon={<Save className="w-3.5 h-3.5" />} onClick={saveDataToDB} disabled={!has}>Save Data</Button>
            </div>
            <div title={!state.isCleansedSaved ? "You must save your data before proceeding to Step 7." : ""}>
              <Button variant="primary" icon={<ArrowRight className="w-3.5 h-3.5" />} onClick={() => navigate('/transform')} disabled={!state.isCleansedSaved}>Next: Transform</Button>
            </div>
          </div>

          {summary && (
            <Card className="mb-4">
              <CardHeader
                title="Cleansing Summary Report"
                subtitle={`Overall Status: ${summary.overall_status || 'SUCCESS'} · ${summary.rows_modified_count ?? 0} rows modified out of ${summary.rows_loaded ?? 0}`}
                icon={<Sparkles className="w-4 h-4 text-violet-600 dark:text-violet-400" />}
              >
                <Button
                  variant="secondary"
                  size="sm"
                  icon={<Download className="w-3 h-3" />}
                  onClick={() => dl(exportFixesReport(summary), 'cleansing_fixes_report.csv', 'text/csv')}
                >
                  Export Fixes Report
                </Button>
              </CardHeader>
              <CardBody className="space-y-4">
                {/* Stats Grid */}
                <StatsGrid>
                  <StatBox value={summary.rows_loaded ?? 0} label="Rows Loaded" color="var(--color-primary-500)" />
                  <StatBox value={summary.rows_modified_count ?? 0} label="Rows Modified" color="var(--color-warning)" />
                  <StatBox value={summary.dynamic_fixes?.count ?? summary.dynamic_fixes?.items?.length ?? 0} label="Dynamic AI Fixes" color="var(--color-violet)" />
                  <StatBox value={summary.validation_fixes?.count ?? summary.validation_fixes?.total ?? summary.validation_fixes?.items?.length ?? 0} label="Validation Fixes" color="var(--color-teal)" />
                  <StatBox value={summary.cleanser_fixes?.count ?? summary.cleanser_fixes?.total ?? summary.cleanser_fixes?.items?.length ?? 0} label="Cleanser Fixes" color="var(--color-success)" />
                </StatsGrid>

                {/* 1. Dynamic AI Fixes Breakdown (Grouped & Parallel) */}
                {renderGroupedFixesSection({
                  title: 'Dynamic AI Rule Fixes',
                  icon: '⚡',
                  items: summary.dynamic_fixes?.items,
                  badgeBg: 'bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300',
                  borderClr: 'border-violet-200 dark:border-violet-900/50',
                  expandedGroups,
                  toggleGroup
                })}

                {/* 2. Validation Fixes Breakdown (Grouped & Parallel) */}
                {renderGroupedFixesSection({
                  title: 'Validation-Directed Fixes',
                  icon: '🛠️',
                  items: summary.validation_fixes?.items,
                  badgeBg: 'bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300',
                  borderClr: 'border-teal-200 dark:border-teal-900/50',
                  expandedGroups,
                  toggleGroup
                })}

                {/* 3. Generic Cleanser Normalization Breakdown (Grouped & Parallel) */}
                {renderGroupedFixesSection({
                  title: 'Cleanser Normalizations',
                  icon: '🧹',
                  items: summary.cleanser_fixes?.items,
                  badgeBg: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300',
                  borderClr: 'border-emerald-200 dark:border-emerald-900/50',
                  expandedGroups,
                  toggleGroup
                })}

                {/* 4. Priority Rule Overrides Section */}
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

                {/* 5. Warnings / Manual Review Items */}
                <div>
                  <div className="text-[11.5px] font-bold text-[var(--text-secondary)] mb-2">
                    Manual Review Items / Warnings ({(Array.isArray(summary.warnings) ? summary.warnings : summary.warnings?.items)?.length ?? 0})
                  </div>
                  {(Array.isArray(summary.warnings) ? summary.warnings : summary.warnings?.items)?.length ? (
                    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-tertiary)] p-3 space-y-1.5 max-h-44 overflow-y-auto">
                      {(Array.isArray(summary.warnings) ? summary.warnings : summary.warnings?.items || []).map((warning: string, i: number) => (
                        <div key={i} className="text-[11px] text-amber-600 dark:text-amber-400 font-mono">
                          {warning}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <InfoBox variant="success">All rules evaluated cleanly without manual review warnings.</InfoBox>
                  )}
                </div>
              </CardBody>
            </Card>
          )}

          <Card>
            <CardHeader title="Cleansed Data">
              {has && <Button variant="secondary" size="sm" icon={<Download className="w-3 h-3" />} onClick={() => dl(expCSV(state.cleaned), 'cleaned.csv', 'text/csv')} className="ml-auto">Export CSV</Button>}
            </CardHeader>
            <CardBody>
              {has ? (
                <DataTable rows={state.cleaned.slice(0, 8)} cols={Object.keys(state.cleaned[0] || {})} />
              ) : (
                <EmptyState icon={<Sparkles className="w-10 h-10 text-primary-500" />} message="Run cleansing to auto-fix data issues" />
              )}
            </CardBody>
          </Card>

        </GridCol>

        {/* Right Column */}
        <GridCol span={3}>
          <Card>
            <CardBody className="p-3 space-y-4">
              {has ? (
                <>
                  <InfoBox variant="success">
                    <strong>✓ Auto-fixed:</strong><br />
                    Country codes normalized<br />
                    Currency standardized<br />
                    IDs padded to 10 digits<br />
                    Special chars removed<br />
                    Whitespace trimmed<br />
                    Payment terms mapped
                  </InfoBox>
                  <InfoBox variant="warning">
                    <strong>⚠ Manual review:</strong><br />
                    Empty required fields<br />
                    Invalid email formats<br />
                    Overlength descriptions
                  </InfoBox>
                </>
              ) : (
                <InfoBox variant="info">Run cleansing to see before/after comparison</InfoBox>
              )}
            </CardBody>
          </Card>
        </GridCol>

      </PageGrid>
    </PageLayout>
  );
}

