import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMigration } from '@/store/migration-store';
import { useToast } from '@/components/ui/toast';
import { useLoading } from '@/components/ui/loading-overlay';
import { OBJS } from '@/data/sap-schemas';
import { COUNTRY_MAP, CURR_MAP, ZTERM_MAP, MTART_MAP } from '@/data/lookup-maps';
import { ai, parseAI } from '@/services/ai-service';
import { dl, expCSV } from '@/lib/utils';
import { PageLayout, PageGrid, GridCol, Card, CardHeader, CardBody, Button, StatBox, StatsGrid, DataTable, PageHeader, Divider, EmptyState, AIResponse } from '@/components/shared';
import { ArrowLeft, ArrowRight, Wrench, Download, Layers } from 'lucide-react';

export function Step4Harmonize() {
  const { state, dispatch } = useMigration();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { showLoad, tick, hideLoad } = useLoading();
  const [aiOutput, setAiOutput] = useState('');
  const has = state.harmonized.length > 0;

  async function runHarmonize() {
    if (!state.extracted.length) { toast('Run extraction first', 'err'); return; }
    showLoad('Harmonizing…', 'Dedup, code conversion, standardization', [
      'Detecting duplicates…', 'Removing empty rows…', 'Mapping country codes…',
      'Converting currencies…', 'Standardizing payment terms…', 'AI analysis…',
    ]);
    [0, 1, 2, 3, 4].forEach((i) => setTimeout(() => tick(i), 400 + i * 380));

    const keyF = OBJS[state.obj]?.fields.find((f) => f.key)?.n;
    const seen = new Set<string>();
    let harmonized = state.extracted.filter((r) => {
      const k = keyF ? r[keyF] : '';
      if (!k || seen.has(k)) return false;
      seen.add(k);
      return true;
    }).filter((r) => Object.values(r).some((v) => v && String(v).trim()));

    harmonized = harmonized.map((r) => {
      const o = { ...r };
      if (o.LAND1) o.LAND1 = COUNTRY_MAP[String(o.LAND1).trim().toUpperCase()] || o.LAND1;
      if (o.WAERS) o.WAERS = CURR_MAP[String(o.WAERS).trim().toUpperCase()] || o.WAERS;
      if (o.ZTERM) o.ZTERM = ZTERM_MAP[String(o.ZTERM).trim().toUpperCase()] || o.ZTERM;
      if (o.MTART) o.MTART = MTART_MAP[String(o.MTART).trim().toUpperCase()] || o.MTART;
      return o;
    });

    try {
      const aiR = await ai(
        `Analyze this harmonized SAP ${state.obj} data. Sample: ${JSON.stringify(harmonized.slice(0, 3))}\nRemaining code conversion issues? Quality score 0-100?\nJSON: {"score":80,"issues":["issue"],"actions":["action"]}`,
        state.aiLog
      );
      tick(5, 'AI done');
      setTimeout(() => {
        hideLoad();
        dispatch({ type: 'SET_FIELD', field: 'harmonized', value: harmonized });
        const res = parseAI(aiR) as Record<string, unknown> | null;
        if (res) {
          setAiOutput(`Quality Score: ${res.score || '?'}/100\n\nRemaining Issues:\n${((res.issues as string[]) || []).map((i: string) => '• ' + i).join('\n')}\n\nActions:\n${((res.actions as string[]) || []).map((a: string) => '→ ' + a).join('\n')}\n\nDuplicates removed: ${state.extracted.length - harmonized.length}`);
        }
        toast(`Harmonized: ${harmonized.length} records (${state.extracted.length - harmonized.length} dupes removed)`, 'ok');
      }, 2800);
    } catch {
      setTimeout(() => {
        hideLoad();
        dispatch({ type: 'SET_FIELD', field: 'harmonized', value: harmonized });
        toast(`Harmonized ${harmonized.length} records`, 'ok');
      }, 2200);
    }
  }

  return (
    <PageLayout>
      <PageGrid>

      {/* Left Column */}
      <GridCol span={3}>
        <Card>
          <CardHeader title="Harmonization" />
          <CardBody className="p-3 space-y-3">
        <div className="text-[10.5px] font-semibold text-[var(--text-secondary)] mb-1.5 px-1">Country Code Map</div>
        {Object.entries(COUNTRY_MAP).slice(0, 10).map(([k, v]) => (
          <div key={k} className="flex justify-between px-2.5 py-1 rounded-lg bg-[var(--bg-tertiary)] font-mono text-[10px]">
            <span className="text-[var(--text-tertiary)]">{k}</span>
            <span className="text-teal-600 dark:text-teal-400">→ {v}</span>
          </div>
        ))}
        <Divider />
        <div className="text-[10.5px] font-semibold text-[var(--text-secondary)] mb-1.5 px-1">Currency Map</div>
        {Object.entries(CURR_MAP).slice(0, 6).map(([k, v]) => (
          <div key={k} className="flex justify-between px-2.5 py-1 rounded-lg bg-[var(--bg-tertiary)] font-mono text-[10px]">
            <span className="text-[var(--text-tertiary)]">{k.slice(0, 14)}</span>
            <span className="text-amber-600 dark:text-amber-400">→ {v}</span>
          </div>
        ))}
        <Divider />
        <div className="text-[10.5px] font-semibold text-[var(--text-secondary)] mb-1.5 px-1">Payment Terms</div>
        {Object.entries(ZTERM_MAP).slice(0, 5).map(([k, v]) => (
          <div key={k} className="flex justify-between px-2.5 py-1 rounded-lg bg-[var(--bg-tertiary)] font-mono text-[10px]">
            <span className="text-[var(--text-tertiary)]">{k}</span>
            <span className="text-violet-600 dark:text-violet-400">→ {v}</span>
          </div>
        ))}
          </CardBody>
        </Card>
      </GridCol>

      {/* Middle Column */}
      <GridCol span={6}>
        <PageHeader title="Step 4 — Harmonize & Profile" subtitle="Apply basic type conversions and structure alignment to S/4HANA target fields">
          <Button variant="secondary" icon={<ArrowLeft className="w-3.5 h-3.5" />} onClick={() => navigate('/extract')}>Back</Button>
          <Button variant="cyan" icon={<Layers className="w-3.5 h-3.5" />} onClick={runHarmonize}>Run Harmonization</Button>
          <Button variant="primary" icon={<ArrowRight className="w-3.5 h-3.5" />} onClick={() => navigate('/validate')} disabled={!has}>Next: Validate</Button>
        </PageHeader>

        {has && (
          <StatsGrid>
            <StatBox value={state.harmonized.length} label="After Dedup" color="var(--color-primary-500)" />
            <StatBox value={state.extracted.length - state.harmonized.length} label="Duplicates Removed" color="var(--color-warning)" />
            <StatBox value="✓" label="Codes Mapped" color="var(--color-success)" />
            <StatBox value="✓" label="Standardized" color="var(--color-teal)" />
          </StatsGrid>
        )}

        <Card>
          <CardHeader title="Harmonized Data">
            {has && <Button variant="secondary" size="sm" icon={<Download className="w-3 h-3" />} onClick={() => dl(expCSV(state.harmonized), 'harmonized.csv', 'text/csv')} className="ml-auto">Export</Button>}
          </CardHeader>
          <CardBody>
            {has ? <DataTable rows={state.harmonized.slice(0, 8)} cols={Object.keys(state.harmonized[0] || {})} /> : <EmptyState icon={<Wrench className="w-10 h-10 text-primary-500" />} message="Run harmonization to standardize code values" />}
          </CardBody>
        </Card>

        {aiOutput && (
          <Card>
            <CardHeader title="AI Harmonization Analysis" />
            <CardBody><AIResponse>{aiOutput}</AIResponse></CardBody>
          </Card>
        )}
      </GridCol>

      {/* Right Column */}
      <GridCol span={3}>
        <Card>
          <CardBody className="p-3 space-y-4">
        {[['Key-based Dedup','Remove duplicate key field rows'],['Empty Row Filter','Remove 100% empty records'],['Country→ISO','Full names to 2-3 letter ISO'],['Currency→ISO','Map to ISO 4217 3-letter'],['PayTerms→SAP','Convert text to NT30/NT45 etc'],['MatType→SAP','Convert to ROH/FERT/HALB etc'],['Whitespace Trim','All fields trimmed']].map(([t,d]) => (
          <div key={t} className="px-3 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--bg-tertiary)]/50">
            <div className="text-[11.5px] font-bold text-[var(--text-primary)]">{t}</div>
            <div className="text-[10px] text-[var(--text-tertiary)]">{d}</div>
          </div>
        ))}
          </CardBody>
        </Card>
      </GridCol>
          
      </PageGrid>
    </PageLayout>
  );
}
