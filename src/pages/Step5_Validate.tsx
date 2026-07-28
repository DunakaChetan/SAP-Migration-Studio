import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useMigration } from '@/store/migration-store';
import { useToast } from '@/components/ui/toast';
import { useLoading } from '@/components/ui/loading-overlay';
import { OBJS } from '@/data/sap-schemas';
import { dl } from '@/lib/utils';
import { cn } from '@/lib/utils';
import { PageLayout, PageGrid, GridCol, Card, CardHeader, CardBody, Button, Badge, StatBox, StatsGrid, PageHeader, EmptyState } from '@/components/shared';
import { ArrowLeft, ArrowRight, Search, Download } from 'lucide-react';

export function Step5Validate() {
  const { state, dispatch } = useMigration();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { showLoad, tick, hideLoad } = useLoading();
  const has = state.validated.length > 0;
  const eR = state.validated.filter((v) => v.st === 'ERROR').length;
  const wR = state.validated.filter((v) => v.st === 'WARN').length;
  const pR = state.validated.filter((v) => v.st === 'PASS').length;

  function doValidate() {
    if (!state.harmonized.length) { toast('Run harmonization first', 'err'); return; }
    showLoad('Validating…', 'Checking SAP field rules', [
      'Loading validation rules…', 'Required fields check…', 'Type validation…',
      'Length checks…', 'Business rules…', 'Generating report…',
    ]);
    [0, 1, 2, 3, 4, 5].forEach((i) => setTimeout(() => tick(i), 300 + i * 310));
    setTimeout(() => {
      const validated = state.harmonized.map((row, idx) => {
        const errs: { f: string; m: string; sev: string }[] = [];
        const warns: { f: string; m: string; sev: string }[] = [];
        (OBJS[state.obj]?.fields || []).forEach((f) => {
          const v = row[f.n];
          const sv = v != null ? String(v).trim() : '';
          if (f.req && !sv) { errs.push({ f: f.n, m: 'Required field empty', sev: 'ERROR' }); return; }
          if (!sv) return;
          if (f.t === 'CUKY' && !/^[A-Z]{3}$/.test(sv)) warns.push({ f: f.n, m: 'Must be 3-letter ISO currency', sev: 'WARN' });
          if (f.t === 'DATS' && !/^\d{8}$/.test(sv)) warns.push({ f: f.n, m: 'Must be YYYYMMDD', sev: 'WARN' });
          if (f.n === 'LAND1' && sv && !/^[A-Z]{2,3}$/.test(sv)) errs.push({ f: f.n, m: 'Country must be ISO 2-3 chars', sev: 'ERROR' });
          if (f.n === 'KUNNR' && sv && !/^\d{0,10}$/.test(sv)) errs.push({ f: f.n, m: 'Must be numeric ≤10 digits', sev: 'ERROR' });
          if (f.n === 'LIFNR' && sv && !/^\d{0,10}$/.test(sv)) errs.push({ f: f.n, m: 'Must be numeric ≤10 digits', sev: 'ERROR' });
          if (f.n === 'SMTP_ADDR' && sv && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(sv)) warns.push({ f: f.n, m: 'Invalid email format', sev: 'WARN' });
          if (f.len && sv.length > f.len) errs.push({ f: f.n, m: `Exceeds max length ${f.len} (actual ${sv.length})`, sev: 'ERROR' });
        });
        return { row, idx, errs, warns, st: errs.length > 0 ? 'ERROR' as const : warns.length > 0 ? 'WARN' as const : 'PASS' as const };
      });
      dispatch({
        type: 'BATCH_UPDATE',
        updates: {
          validated,
          stats: {
            ...state.stats,
            errors: validated.filter((v) => v.st === 'ERROR').length,
            warns: validated.filter((v) => v.st === 'WARN').length,
            passed: validated.filter((v) => v.st === 'PASS').length,
          },
        },
      });
      hideLoad();
      toast(`Validation: ${validated.filter((v) => v.st === 'PASS').length} PASS · ${validated.filter((v) => v.st === 'ERROR').length} ERROR · ${validated.filter((v) => v.st === 'WARN').length} WARN`, 'ok');
    }, 2600);
  }

  function expErrors(): string {
    const rows = ['#,Status,Field,Error,Record'];
    state.validated.forEach((v, i) =>
      [...v.errs, ...v.warns].forEach((e) =>
        rows.push(`${i + 1},${e.sev},${e.f},"${e.m}","${Object.values(v.row || {}).slice(0, 3).join('|').replace(/"/g, "'")}"`)
      )
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
        <PageHeader title="Step 5 — Data Validation" subtitle="Validate against SAP S/4HANA field rules, required fields, data types, business rules">
          <Button variant="secondary" icon={<ArrowLeft className="w-3.5 h-3.5" />} onClick={() => navigate('/harmonize')}>Back</Button>
          <Button variant="warning" icon={<Search className="w-3.5 h-3.5" />} onClick={doValidate}>Run Validation</Button>
          {has && <Button variant="danger" size="sm" icon={<Download className="w-3 h-3" />} onClick={() => dl(expErrors(), 'errors.csv', 'text/csv')}>Error Report</Button>}
          <Button variant="primary" icon={<ArrowRight className="w-3.5 h-3.5" />} onClick={() => navigate('/cleanse')} disabled={!has}>Next: Cleanse</Button>
        </PageHeader>

        {has && (
          <StatsGrid>
            <StatBox value={pR} label="PASS" subtitle={`${Math.round((pR / (state.validated.length || 1)) * 100)}%`} color="var(--color-success)" />
            <StatBox value={eR} label="ERRORS" subtitle="Blocks migration" color="var(--color-danger)" />
            <StatBox value={wR} label="WARNINGS" subtitle="Review needed" color="var(--color-warning)" />
            <StatBox value={state.validated.length} label="Total" color="var(--color-primary-500)" />
          </StatsGrid>
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
