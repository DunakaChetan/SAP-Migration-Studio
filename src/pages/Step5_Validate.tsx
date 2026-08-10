import React, { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMigration } from '@/store/migration-store';
import { useToast } from '@/components/ui/toast';
import { useLoading } from '@/components/ui/loading-overlay';
import { OBJS } from '@/data/sap-schemas';
import { dl } from '@/lib/utils';
import { cn } from '@/lib/utils';
import { PageLayout, PageGrid, GridCol, Card, CardHeader, CardBody, Button, Badge, StatBox, StatsGrid, PageHeader, EmptyState } from '@/components/shared';
import { ArrowLeft, ArrowRight, Search, Download, Upload, FileSpreadsheet, ListChecks, Save } from 'lucide-react';

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

    showLoad('Validating…', 'Checking SAP field rules', [
      'Loading validation rules…', 'Sending data to validation service…', 'Applying 8 field rules…',
      'Grouping failures by rule…', 'Computing stats…', 'Generating report…',
    ]);
    [0, 1, 2, 3, 4, 5].forEach((i) => setTimeout(() => tick(i), 250 + i * 220));

    try {
      let data: any;

      if (source === 'upload' && uploadedFile) {
        const fd = new FormData();
        fd.append('obj', state.obj);
        fd.append('file', uploadedFile);
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
          body: JSON.stringify({ project_id: state.projectId, target_object: state.obj }),
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
          stats: { ...state.stats, errors: data.stats.errors, warns: data.stats.warns, passed: data.stats.passed },
        },
      });
      hideLoad();
      toast(`Validation: ${data.stats.passed} PASS · ${data.stats.errors} ERROR · ${data.stats.warns} WARN`, 'ok');
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
      state.validated.forEach((v, i) => {
        [...v.errs, ...v.warns].forEach((e) => {
          errorReport.push({
            rule_code: e.rule,
            row_number: i + 1,
            field_name: e.f,
            severity: e.sev,
            reason: e.m,
            invalid_value: String(v.row[e.f] ?? '')
          });
        });
      });

      const res = await fetch('/api/validate/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: state.projectId,
          target_object: state.obj,
          payload: errorReport
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
    const rows = ['Row Number,Rule Code,Field Name,Severity,Reason,Invalid Value'];
    state.validated.forEach((v, i) =>
      [...v.errs, ...v.warns].forEach((e) => {
        const val = String(v.row[e.f] ?? '').replace(/"/g, "'");
        rows.push(`${i + 1},${e.rule},${e.f},${e.sev},"${e.m}","${val}"`);
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
          <Card>
            <CardHeader title="Validation Report — By Rule" subtitle="Feed this into Cleansing" icon={<ListChecks className="w-4 h-4" />}>
              <Button variant="secondary" size="sm" icon={<Download className="w-3 h-3" />} onClick={() => dl(expErrors(), 'errors.csv', 'text/csv')}>
                Export Report
              </Button>
            </CardHeader>
            <CardBody className="space-y-2">
              {report.map((r) => (
                <div key={r.rule} className="px-3 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--bg-tertiary)]/30">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-[12px] font-bold text-[var(--text-primary)]">{r.label}</span>
                      <span className="text-[10.5px] text-[var(--text-tertiary)] ml-2">{r.description}</span>
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
      <GridCol span={3}>
        <Card>
          <CardBody className="p-3 space-y-4">
        {[['Required Fields','Must not be empty'],['Field Length','Max char enforcement'],['Country ISO','2-3 letter format'],['Currency ISO','3-letter ISO 4217'],['Numeric IDs','KUNNR/LIFNR digits'],['Email Format','Valid @ format'],['Date Format','YYYYMMDD 8 digits'],['Payment Terms','SAP NT30/NT45 format']].map(([t,d]) => (
          <div key={t} className="flex gap-2 px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--bg-tertiary)]/50">
            <span className="text-primary-500 mt-0.5">◆</span>
            <div>
              <div className="text-[11.5px] font-bold text-[var(--text-primary)]">{t}</div>
              <div className="text-[10px] text-[var(--text-tertiary)]">{d}</div>
            </div>
          </div>
        ))}
          </CardBody>
        </Card>
      </GridCol>

      </PageGrid>
    </PageLayout>
  );
}
