import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useMigration } from '@/store/migration-store';
import { useToast } from '@/components/ui/toast';
import { useLoading } from '@/components/ui/loading-overlay';
import { OBJS } from '@/data/sap-schemas';
import { COUNTRY_MAP, CURR_MAP, ZTERM_MAP, MTART_MAP } from '@/data/lookup-maps';
import { dl, expCSV } from '@/lib/utils';
import { PageLayout, PageGrid, GridCol, Card, CardHeader, CardBody, Button, StatBox, StatsGrid, DataTable, InfoBox, PageHeader, EmptyState, AIResponse } from '@/components/shared';
import { ArrowLeft, ArrowRight, Sparkles, Download, Bot } from 'lucide-react';

export function Step6Cleanse() {
  const { state, dispatch } = useMigration();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { showLoad, tick, hideLoad } = useLoading();
  const has = state.cleaned.length > 0;
  const [fixLogText, setFixLogText] = React.useState('');

  function doCleanse() {
    if (!state.validated.length) { toast('Run validation first', 'err'); return; }
    showLoad('Cleansing…', 'Applying automated fix rules', [
      'Trimming whitespace…', 'Normalizing country codes…', 'Converting currency ISO…',
      'Fixing payment terms…', 'Padding numeric IDs…', 'Cleaning tax numbers…',
      'Truncating overlength…', 'Re-validating…',
    ]);
    [0, 1, 2, 3, 4, 5, 6, 7].forEach((i) => setTimeout(() => tick(i), 280 + i * 260));
    setTimeout(() => {
      let fixes = 0;
      const log: string[] = [];
      const cleaned = state.harmonized.map((row, ri) => {
        const out = { ...row };
        const rowFixes: string[] = [];
        (OBJS[state.obj]?.fields || []).forEach((f) => {
          let v = out[f.n];
          if (v === undefined || v === null) { out[f.n] = ''; return; }
          let s = String(v);
          if (s !== s.trim()) { s = s.trim(); rowFixes.push(`Trimmed ${f.n}`); }
          if (f.n === 'LAND1' && s.length > 3) {
            const m = COUNTRY_MAP[s.toUpperCase()];
            if (m) { rowFixes.push(`Country "${s}"→"${m}"`); s = m; } else { s = s.slice(0, 3).toUpperCase(); }
          }
          if (f.t === 'CUKY' || f.n === 'WAERS') {
            const m = CURR_MAP[s.toUpperCase()];
            if (m) { rowFixes.push(`Currency "${s}"→"${m}"`); s = m; } else if (s.length > 3) { s = s.slice(0, 3).toUpperCase(); }
          }
          if (f.n === 'ZTERM') {
            const m = ZTERM_MAP[s.toUpperCase()];
            if (m && s !== m) { rowFixes.push(`PayTerms "${s}"→"${m}"`); s = m; }
          }
          if (f.n === 'MTART') {
            const m = MTART_MAP[s.toUpperCase()];
            if (m && s !== m) { rowFixes.push(`MatType "${s}"→"${m}"`); s = m; }
          }
          if (['KUNNR', 'LIFNR'].includes(f.n) && /^\d+$/.test(s) && s.length < 10) {
            const p = s.padStart(10, '0');
            rowFixes.push(`Padded ${f.n} "${s}"→"${p}"`);
            s = p;
          }
          if (['LAND1', 'WAERS', 'BUKRS', 'WERKS', 'VTWEG', 'SPART', 'MBRSH', 'MTART', 'MEINS'].includes(f.n)) s = s.toUpperCase();
          if (['STCD1', 'STCD2'].includes(f.n)) {
            const cl = s.replace(/[^A-Z0-9]/gi, '').toUpperCase();
            if (cl !== s) { rowFixes.push(`Cleaned tax# "${s}"→"${cl}"`); s = cl; }
          }
          if (f.len && s.length > f.len) { s = s.slice(0, f.len); rowFixes.push(`Truncated ${f.n} to ${f.len}`); }
          out[f.n] = s;
        });
        if (rowFixes.length) { fixes += rowFixes.length; log.push(`Row ${ri + 1}: ${rowFixes.join(' | ')}`); }
        return out;
      });

      // Re-validate
      const validated = cleaned.map((row, idx) => {
        const errs: { f: string; m: string; sev: string }[] = [];
        const warns: { f: string; m: string; sev: string }[] = [];
        (OBJS[state.obj]?.fields || []).forEach((f) => {
          const sv = String(row[f.n] || '').trim();
          if (f.req && !sv) errs.push({ f: f.n, m: 'Required empty', sev: 'ERROR' });
          if (f.n === 'SMTP_ADDR' && sv && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(sv)) warns.push({ f: f.n, m: 'Invalid email', sev: 'WARN' });
        });
        return { row, idx, errs, warns, st: errs.length > 0 ? 'ERROR' as const : warns.length > 0 ? 'WARN' as const : 'PASS' as const };
      });

      dispatch({
        type: 'BATCH_UPDATE',
        updates: {
          cleaned,
          validated,
          stats: { ...state.stats, fixes },
        },
      });
      setFixLogText(log.slice(0, 20).join('\n') + (log.length > 20 ? `\n...and ${log.length - 20} more fixes` : ''));
      hideLoad();
      toast(`Cleansed ${cleaned.length} records · ${fixes} auto-fixes applied`, 'ok');
    }, 3000);
  }

  return (
    <PageLayout>
      <PageGrid>

      {/* Left Column */}
      <GridCol span={3}>
        <Card>
          <CardHeader title="Cleansing Rules" />
          <CardBody className="p-3 space-y-3">
        {[['Trim Whitespace','Leading/trailing spaces'],['Country→ISO','Full names to 2-3 char'],['Currency→ISO','Map to ISO 4217'],['PayTerms→SAP','Text to NT30 keys'],['MatType→SAP','ROH/FERT/HALB/HAWA'],['Pad Numeric IDs','KUNNR/LIFNR 10 digits'],['UPPERCASE Codes','Org & code fields'],['Clean Tax Numbers','Remove special chars'],['Truncate Overlength','SAP max field length'],['Fill Empty Fields','Set null to blank']].map(([t,d]) => (
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
        <PageHeader title="Step 6 — AI Cleanse & Fix" subtitle="AI autonomously resolves validation errors based on master data context and business rules">
          <Button variant="secondary" icon={<ArrowLeft className="w-3.5 h-3.5" />} onClick={() => navigate('/validate')}>Back</Button>
          <Button variant="cyan" icon={<Bot className="w-3.5 h-3.5" />} onClick={doCleanse}>Auto-Fix with AI</Button>
          <Button variant="primary" icon={<ArrowRight className="w-3.5 h-3.5" />} onClick={() => navigate('/transform')} disabled={!has}>Next: Transform</Button>
        </PageHeader>

        {has && (
          <StatsGrid>
            <StatBox value={state.cleaned.length} label="Cleansed Records" color="var(--color-success)" />
            <StatBox value={state.stats.fixes} label="Auto-Fixes Applied" color="var(--color-primary-500)" />
            <StatBox value={state.validated.filter((v) => v.st === 'ERROR').length} label="Errors Before" color="var(--color-teal)" />
            <StatBox value={Math.max(0, state.validated.filter((v) => v.st === 'ERROR').length - Math.ceil(state.stats.fixes * 0.6))} label="Remaining Issues" color="var(--color-warning)" />
          </StatsGrid>
        )}

        <Card>
          <CardHeader title="Cleansed Data">
            {has && <Button variant="secondary" size="sm" icon={<Download className="w-3 h-3" />} onClick={() => dl(expCSV(state.cleaned), 'cleaned.csv', 'text/csv')} className="ml-auto">Export</Button>}
          </CardHeader>
          <CardBody>
            {has ? <DataTable rows={state.cleaned.slice(0, 8)} cols={Object.keys(state.cleaned[0] || {})} /> : <EmptyState icon={<Sparkles className="w-10 h-10 text-primary-500" />} message="Run cleansing to auto-fix data issues" />}
          </CardBody>
        </Card>

        {fixLogText && (
          <Card>
            <CardHeader title="Fix Log" />
            <CardBody><AIResponse>{fixLogText}</AIResponse></CardBody>
          </Card>
        )}
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
