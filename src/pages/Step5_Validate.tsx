import React, { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMigration } from '@/store/migration-store';
import { useToast } from '@/components/ui/toast';
import { useLoading } from '@/components/ui/loading-overlay';
import { OBJS } from '@/data/sap-schemas';
import { dl } from '@/lib/utils';
import { PageLayout, PageGrid, GridCol, Card, CardHeader, CardBody, Button, Badge, StatBox, StatsGrid, EmptyState } from '@/components/shared';
import { ArrowLeft, ArrowRight, Search, Download, Upload, ListChecks, Save, Sparkles, Plus, Trash2, Zap, FileText, Pencil, Check, X } from 'lucide-react';

const VALIDATE_API = 'http://localhost:8000';

interface RuleFailure {
  idx: number;
  field: string;
  value: string;
  message: string;
  severity: string;
}

interface RuleReport {
  rule: string;
  label: string;
  description: string;
  is_dynamic?: boolean;
  totalChecked: number;
  failCount: number;
  passCount: number;
  failures: RuleFailure[];
}

type Source = 'harmonized' | 'upload';

export function Step5Validate() {
  const { state, dispatch } = useMigration();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { showLoad, tick, hideLoad } = useLoading();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [source, setSource] = useState<Source>('harmonized');
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const report = (state.validationReport || []) as RuleReport[];
  const [uploadMeta, setUploadMeta] = useState<{ rows: number; cols: number } | null>(null);

  // Dynamic Rules State
  const [customPrompts, setCustomPrompts] = useState<string[]>([
    'Postal code (PSTLZ) must be exactly 5 digits when country (LAND1) is US',
    'Customer email (SMTP_ADDR) must not be empty when country (LAND1) is US',
  ]);
  const [newPromptInput, setNewPromptInput] = useState('');
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editingText, setEditingText] = useState('');

  const handleAddPrompt = () => {
    if (!newPromptInput.trim()) return;
    setCustomPrompts([...customPrompts, newPromptInput.trim()]);
    setNewPromptInput('');
  };

  const handleRemovePrompt = (index: number) => {
    setCustomPrompts(customPrompts.filter((_, i) => i !== index));
    if (editingIndex === index) {
      setEditingIndex(null);
      setEditingText('');
    }
  };

  const handleStartEdit = (index: number) => {
    setEditingIndex(index);
    setEditingText(customPrompts[index]);
  };

  const handleSaveEdit = (index: number) => {
    if (!editingText.trim()) return;
    const updated = [...customPrompts];
    updated[index] = editingText.trim();
    setCustomPrompts(updated);
    setEditingIndex(null);
    setEditingText('');
  };

  const handleCancelEdit = () => {
    setEditingIndex(null);
    setEditingText('');
  };

  const isRuleOverridden = (ruleTitle: string): boolean => {
    const overriddenList = ((state.stats as any)?.overridden_rules || []) as string[];
    const titleLower = ruleTitle.toLowerCase();
    if (titleLower.includes('country') && overriddenList.includes('COUNTRY_ISO')) return true;
    if (titleLower.includes('currency') && overriddenList.includes('CURRENCY_ISO')) return true;
    if (titleLower.includes('email') && overriddenList.includes('EMAIL_FORMAT')) return true;
    if (titleLower.includes('numeric') && overriddenList.includes('NUMERIC_ID')) return true;
    if (titleLower.includes('payment') && overriddenList.includes('PAYMENT_TERMS')) return true;
    return false;
  };

  const has = state.validated.length > 0;
  const eR = state.validated.filter((v) => v.st === 'ERROR').length;
  const wR = state.validated.filter((v) => v.st === 'WARN').length;
  const pR = state.validated.filter((v) => v.st === 'PASS').length;

  async function runValidation() {
    if (source === 'upload' && !uploadedFile) {
      toast('Choose a CSV file first', 'err');
      return;
    }
    if (source === 'harmonized' && !state.projectId) {
      toast('Project not found. Please start from Step 1.', 'err');
      return;
    }
    
    dispatch({ type: 'SET_FIELD', field: 'isValidatedSaved', value: false });

    showLoad('Validating…', `Checking SAP field rules${customPrompts.length > 0 ? ` + ${customPrompts.length} custom AI rules` : ''}`, [
      'Compiling custom AI rules via LLM (1 call)…',
      'Loading validation rules…',
      'Sending data to validation service…',
      `Applying standard & ${customPrompts.length} custom rules…`,
      'Grouping failures by rule…',
      'Generating unified report…',
    ]);
    [0, 1, 2, 3, 4, 5].forEach((i) => setTimeout(() => tick(i), 250 + i * 220));

    try {
      let data: any;

      if (source === 'upload' && uploadedFile) {
        const fd = new FormData();
        fd.append('obj', state.obj);
        fd.append('file', uploadedFile);
        if (customPrompts.length > 0) {
          fd.append('custom_prompts_json', JSON.stringify(customPrompts));
        }
        const res = await fetch(`${VALIDATE_API}/api/validate/upload-csv`, { method: 'POST', body: fd });
        if (!res.ok) {
          const e = await res.json().catch(() => ({}));
          throw new Error(e.detail || 'CSV validation failed');
        }
        data = await res.json();
        setUploadMeta({ rows: data.rows?.length || 0, cols: data.headers?.length || 0 });
      } else {
        const res = await fetch(`${VALIDATE_API}/api/validate/flow`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            project_id: state.projectId,
            target_object: state.obj,
            custom_prompts: customPrompts
          }),
        });
        if (!res.ok) {
          const e = await res.json().catch(() => ({}));
          throw new Error(e.detail || 'Validation failed');
        }
        data = await res.json();
        setUploadMeta(null);
      }

      dispatch({
        type: 'BATCH_UPDATE',
        updates: {
          validated: data.validated,
          validationReport: data.report,
          dynamicRules: data.dynamic_rules || [],
          stats: { ...state.stats, errors: data.stats.errors, warns: data.stats.warns, passed: data.stats.passed },
        },
      });
      hideLoad();
      toast(`Validation Complete: ${data.stats.passed} PASS · ${data.stats.errors} ERROR · ${data.stats.warns} WARN`, 'ok');
    } catch (err) {
      hideLoad();
      const msg = err instanceof Error ? err.message : 'Validation failed';
      toast(`${msg}`, 'err');
    }
  }

  const saveDataToDB = async () => {
    if (!state.projectId) {
      toast('No project ID found. Please create a project first.', 'err');
      return;
    }
    if (!has) return;
    
    showLoad('Saving data...', 'Persisting validated records to database');
    try {
      const errorReport: any[] = [];
      state.validated.forEach((v) => {
        [...v.errs, ...v.warns].forEach((e) => {
          const isDyn = e.rule.startsWith('DYNAMIC_') || !['REQUIRED_FIELDS', 'FIELD_LENGTH', 'COUNTRY_ISO', 'CURRENCY_ISO', 'NUMERIC_ID', 'EMAIL_FORMAT', 'DATE_FORMAT', 'PAYMENT_TERMS'].includes(e.rule);
          let val = v.row[e.f];
          if (val === undefined) {
            const matchKey = Object.keys(v.row || {}).find((k) => k.toLowerCase() === (e.f || '').toLowerCase());
            val = matchKey ? v.row[matchKey] : '';
          }
          errorReport.push({
            rule_code: e.rule,
            rule_type: isDyn ? 'Dynamic AI Rule' : 'Standard SAP Rule',
            row_number: v.idx + 1,
            field_name: e.f,
            severity: e.sev,
            reason: e.m,
            invalid_value: String(val ?? '')
          });
        });
      });

      const res = await fetch(`${import.meta.env.VITE_BACKEND_URL}/api/validate/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: state.projectId,
          target_object: state.obj,
          payload: errorReport,
          dynamic_rules: state.dynamicRules || []
        })
      });
      
      if (!res.ok) throw new Error('Failed to save data');
      
      hideLoad();
      dispatch({ type: 'SET_FIELD', field: 'isValidatedSaved', value: true });
      toast('Validated data saved to database successfully!', 'ok');
    } catch (err: any) {
      hideLoad();
      toast(err.message || 'Failed to save data', 'err');
    }
  };

  function expErrors(): string {
    const rows = ['Row Number,Rule Code,Rule Type,Field Name,Severity,Reason,Invalid Value'];
    state.validated.forEach((v) =>
      [...v.errs, ...v.warns].forEach((e) => {
        const isDyn = e.rule.startsWith('DYNAMIC_') || !['REQUIRED_FIELDS', 'FIELD_LENGTH', 'COUNTRY_ISO', 'CURRENCY_ISO', 'NUMERIC_ID', 'EMAIL_FORMAT', 'DATE_FORMAT', 'PAYMENT_TERMS'].includes(e.rule);
        const ruleType = isDyn ? 'Dynamic AI Rule' : 'Standard SAP Rule';
        
        let val = v.row[e.f];
        if (val === undefined) {
          const matchKey = Object.keys(v.row || {}).find((k) => k.toLowerCase() === (e.f || '').toLowerCase());
          val = matchKey ? v.row[matchKey] : '';
        }
        const cleanVal = String(val ?? '').replace(/"/g, "'");
        const cleanMsg = String(e.m ?? '').replace(/"/g, "'");
        rows.push(`${v.idx + 1},"${e.rule}","${ruleType}","${e.f}","${e.sev}","${cleanMsg}","${cleanVal}"`);
      })
    );
    return rows.join('\n');
  }

  return (
    <PageLayout>
      <PageGrid>

      {/* Left Column */}
      <GridCol span={3}>
        <Card>
          <CardHeader title="Field Rules" subtitle={`${state.obj} validation`} />
          <CardBody className="p-3 space-y-3">
            {(OBJS[state.obj]?.fields || []).map((f) => (
              <div key={f.n} className="px-2.5 py-2 rounded-xl border border-[var(--border)] bg-[var(--bg-tertiary)]/50">
                <div className="flex items-center justify-between mb-0.5">
                  <span className="font-mono text-[10px] text-teal-600 dark:text-teal-400">{f.n}</span>
                  {f.req && <Badge variant="red" className="text-[8px]">REQ</Badge>}
                </div>
                <div className="text-[10px] text-[var(--text-secondary)]">{f.l}</div>
                <div className="font-mono text-[9px] text-[var(--text-tertiary)]">{f.t} | max:{f.len}</div>
              </div>
            ))}
          </CardBody>
        </Card>
      </GridCol>

      {/* Middle Column */}
      <GridCol span={6}>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--text-primary)]">Step 5 — Data Validation</h1>
          <p className="mt-1 max-w-2xl text-sm text-[var(--text-secondary)]">Validate against SAP S/4HANA field rules, required fields, data types, business rules</p>
        </div>

        <div className="flex items-center gap-2 mt-4">
          <button
            onClick={() => { setSource('harmonized'); dispatch({ type: 'BATCH_UPDATE', updates: { validated: [], validationReport: [] } }); }}
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
            onClick={() => { setSource('upload'); dispatch({ type: 'BATCH_UPDATE', updates: { validated: [], validationReport: [] } }); }}
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
          <div className="flex items-center gap-2 mt-4">
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              className="hidden"
              onChange={(e) => setUploadedFile(e.target.files?.[0] || null)}
            />
            <Button variant="secondary" size="sm" icon={<Upload className="w-3.5 h-3.5" />} onClick={() => fileInputRef.current?.click()}>
              {uploadedFile ? uploadedFile.name : 'Choose CSV File…'}
            </Button>
            {uploadMeta && (
              <span className="text-[10.5px] text-[var(--text-tertiary)]">
                Loaded {uploadMeta.rows} rows × {uploadMeta.cols} columns
              </span>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 border-t border-[var(--border)] pt-3 mt-4 mb-4">
          <Button variant="secondary" icon={<ArrowLeft className="w-3.5 h-3.5" />} onClick={() => navigate('/harmonize')}>Back</Button>
          <Button variant="warning" icon={<Search className="w-3.5 h-3.5" />} onClick={runValidation} disabled={source === 'upload' && !uploadedFile}>Run Validation</Button>
          <div title={!has ? "Run validation first before saving." : ""}>
            <Button variant="secondary" icon={<Save className="w-3.5 h-3.5" />} onClick={saveDataToDB} disabled={!has}>Save Report</Button>
          </div>
          <div title={!state.isValidatedSaved ? "You must save your data before proceeding to Step 6." : ""}>
            <Button variant="primary" icon={<ArrowRight className="w-3.5 h-3.5" />} onClick={() => navigate('/cleanse')} disabled={!state.isValidatedSaved}>Next: Cleanse</Button>
          </div>
        </div>

        {has && (
          <StatsGrid>
            <StatBox value={pR} label="PASS" subtitle={`${Math.round((pR / (state.validated.length || 1)) * 100)}%`} color="var(--color-success)" />
            <StatBox value={eR} label="ERRORS" subtitle="Blocks migration" color="var(--color-danger)" />
            <StatBox value={wR} label="WARNINGS" subtitle="Review needed" color="var(--color-warning)" />
            <StatBox value={state.validated.length} label="Total" color="var(--color-primary-500)" />
          </StatsGrid>
        )}

        {report.length > 0 && (
          <Card className="mb-4">
            <CardHeader title="Validation Report — Active Rules" subtitle="Executed Dynamic AI Rules & Standard SAP Rules" icon={<ListChecks className="w-4 h-4" />}>
              <Button variant="secondary" size="sm" icon={<Download className="w-3 h-3" />} onClick={() => dl(expErrors(), 'errors.csv', 'text/csv')}>
                Export Report
              </Button>
            </CardHeader>
            <CardBody className="space-y-2">
              {report.map((r) => (
                <div key={r.rule} className={`px-3 py-2.5 rounded-xl border transition-all ${
                  r.is_dynamic
                    ? 'border-violet-300 dark:border-violet-700/60 bg-violet-50/20 dark:bg-violet-950/15'
                    : 'border-[var(--border)] bg-[var(--bg-tertiary)]/30'
                }`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-[12px] font-bold text-[var(--text-primary)]">{r.label}</span>
                      {r.is_dynamic && (
                        <span className="px-1.5 py-0.5 rounded bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 text-[8.5px] font-bold flex items-center gap-1">
                          ⚡ AI Dynamic Rule (Overriding Priority)
                        </span>
                      )}
                      <span className="text-[10.5px] text-[var(--text-tertiary)]">{r.description}</span>
                    </div>
                    <Badge variant={r.failCount > 0 ? 'red' : 'green'}>
                      {r.failCount > 0 ? `${r.failCount} failing` : 'All pass'}
                    </Badge>
                  </div>
                  {r.failures.length > 0 && (
                    <div className="mt-1.5 space-y-0.5">
                      {r.failures.slice(0, 4).map((f, i) => (
                        <div key={i} className="text-[10.5px] text-[var(--text-secondary)] font-mono">
                          #{f.idx + 1} <strong>{f.field}</strong>="{String(f.value).slice(0, 24)}" — {f.message}
                        </div>
                      ))}
                      {r.failures.length > 4 && (
                        <div className="text-[10px] text-[var(--text-tertiary)]">
                          +{r.failures.length - 4} more — see exported report
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </CardBody>
          </Card>
        )}

        <Card>
          <CardHeader title="Validation Results" />
          <CardBody>
            {has ? (
              <div className="space-y-1.5">
                {state.validated.slice(0, 12).map((v, i) => (
                  <div key={i} className="grid grid-cols-[80px_1fr_70px] gap-3 items-start px-3 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--bg-tertiary)]/30">
                    <div>
                      <div className="font-mono text-[11px] text-primary-600 dark:text-primary-400">#{v.idx + 1}</div>
                      <div className="text-[9.5px] text-[var(--text-tertiary)] mt-0.5 truncate">{Object.values(v.row || {}).filter(Boolean).slice(0, 2).map(String).join(' · ').slice(0, 28)}</div>
                    </div>
                    <div className="space-y-0.5">
                      {v.errs.slice(0, 2).map((e, ei) => (
                        <div key={ei} className="text-[11px] text-red-600 dark:text-red-400">✗ <strong>{e.f}</strong>: {e.m}</div>
                      ))}
                      {v.warns.slice(0, 1).map((w, wi) => (
                        <div key={wi} className="text-[11px] text-amber-600 dark:text-amber-400">⚠ <strong>{w.f}</strong>: {w.m}</div>
                      ))}
                      {v.st === 'PASS' && <div className="text-[11px] text-emerald-600 dark:text-emerald-400">✓ All rules passed</div>}
                    </div>
                    <Badge variant={v.st === 'ERROR' ? 'red' : v.st === 'WARN' ? 'amber' : 'green'} className="justify-self-end">{v.st}</Badge>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState icon={<Search className="w-10 h-10 text-primary-500" />} message="Run validation to check field rules" />
            )}
          </CardBody>
        </Card>
      </GridCol>

      {/* Right Column */}
      <GridCol span={3} className="space-y-4">
        {/* Standard SAP 8 Rules Card */}
        <Card>
          <CardHeader title="Standard SAP Rules" subtitle="Built-in field validations" icon={<ListChecks className="w-4 h-4" />} />
          <CardBody className="p-3 space-y-2.5">
            {[
              ['Required Fields','Must not be empty'],
              ['Field Length','Max char enforcement'],
              ['Country ISO','2-3 letter format'],
              ['Currency ISO','3-letter ISO 4217'],
              ['Numeric IDs','KUNNR/LIFNR digits'],
              ['Email Format','Valid @ format'],
              ['Date Format','YYYYMMDD 8 digits'],
              ['Payment Terms','SAP NT30/NT45 format']
            ].map(([t,d]) => {
              const isOverridden = isRuleOverridden(t);
              return (
                <div key={t} className={`flex items-start justify-between px-3 py-2 rounded-xl border transition-all ${
                  isOverridden
                    ? 'border-amber-200 dark:border-amber-900/40 bg-amber-50/20 dark:bg-amber-950/10 opacity-70'
                    : 'border-[var(--border)] bg-[var(--bg-tertiary)]/50'
                }`}>
                  <div className="flex items-start gap-2">
                    <span className={isOverridden ? "text-amber-500 mt-0.5 text-[11px]" : "text-primary-500 mt-0.5 text-[11px]"}>◆</span>
                    <div>
                      <div className={`text-[11.5px] font-bold ${isOverridden ? 'line-through text-[var(--text-tertiary)]' : 'text-[var(--text-primary)]'}`}>
                        {t}
                      </div>
                      <div className="text-[10px] text-[var(--text-tertiary)]">{d}</div>
                    </div>
                  </div>
                  {isOverridden && (
                    <span className="px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 text-[8px] font-bold shrink-0 ml-1">
                      ⚡ Overridden
                    </span>
                  )}
                </div>
              );
            })}
          </CardBody>
        </Card>

        {/* Dynamic AI Custom Rules Card — Displayed underneath Default Rules */}
        <Card className="border-violet-200 dark:border-violet-900/50 bg-gradient-to-br from-[var(--bg-primary)] to-violet-50/20 dark:to-violet-950/10">
          <CardHeader
            title="Dynamic AI Rules"
            subtitle="Custom business rules"
            icon={<Sparkles className="w-4 h-4 text-violet-600 dark:text-violet-400" />}
          />
          <CardBody className="p-3 space-y-3">
            {/* Input & Add Prompt */}
            <div className="flex items-center gap-1.5">
              <input
                type="text"
                value={newPromptInput}
                onChange={(e) => setNewPromptInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddPrompt()}
                placeholder="e.g. Currency ISO must be 4 digits"
                className="flex-1 px-2.5 py-1.5 rounded-lg text-[11px] bg-[var(--bg-tertiary)] border border-[var(--border)] text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-violet-500"
              />
              <Button variant="secondary" size="sm" icon={<Plus className="w-3.5 h-3.5" />} onClick={handleAddPrompt}>
                Add
              </Button>
            </div>

            {/* List of Custom Prompts */}
            {customPrompts.length > 0 ? (
              <div className="space-y-1.5 pt-1">
                <div className="flex items-center justify-between text-[10px] font-bold text-[var(--text-tertiary)] uppercase tracking-wider">
                  <span>Custom Prompts ({customPrompts.length})</span>
                  <span className="text-[9.5px] text-violet-600 dark:text-violet-400 font-semibold normal-case">
                    ⚡ Overrides Default
                  </span>
                </div>
                <div className="space-y-1.5 max-h-[220px] overflow-y-auto scrollbar-thin">
                  {customPrompts.map((p, idx) => (
                    <div key={idx} className="flex items-center justify-between p-2 rounded-lg bg-[var(--bg-tertiary)]/70 text-[10.5px] border border-[var(--border)] gap-1.5">
                      {editingIndex === idx ? (
                        <div className="flex items-center gap-1.5 w-full">
                          <span className="text-violet-600 font-bold shrink-0">⚡ #{idx + 1}</span>
                          <input
                            type="text"
                            value={editingText}
                            onChange={(e) => setEditingText(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleSaveEdit(idx);
                              if (e.key === 'Escape') handleCancelEdit();
                            }}
                            className="flex-1 px-2 py-1 text-[10.5px] rounded bg-[var(--bg-primary)] border border-violet-400 text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-violet-500 font-medium"
                            autoFocus
                          />
                          <button
                            onClick={() => handleSaveEdit(idx)}
                            className="p-1 rounded text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10 cursor-pointer shrink-0 transition-colors"
                            title="Save rule"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={handleCancelEdit}
                            className="p-1 rounded text-[var(--text-tertiary)] hover:bg-[var(--bg-secondary)] cursor-pointer shrink-0 transition-colors"
                            title="Cancel edit"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <>
                          <div className="flex gap-1.5 items-start">
                            <span className="text-violet-600 font-bold shrink-0">⚡</span>
                            <span className="text-[var(--text-primary)] font-medium leading-tight">#{idx + 1}. {p}</span>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              onClick={() => handleStartEdit(idx)}
                              className="text-[var(--text-tertiary)] hover:text-violet-500 p-1 rounded hover:bg-violet-500/10 transition-colors cursor-pointer"
                              title="Edit dynamic rule"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleRemovePrompt(idx)}
                              className="text-[var(--text-tertiary)] hover:text-red-500 p-1 rounded hover:bg-red-500/10 transition-colors cursor-pointer"
                              title="Delete dynamic rule"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="text-[10px] text-[var(--text-tertiary)] italic px-1 py-1">
                No custom AI rules added yet. Add rule prompts above to run custom business validations.
              </div>
            )}
          </CardBody>
        </Card>
      </GridCol>

      </PageGrid>
    </PageLayout>
  );
}
