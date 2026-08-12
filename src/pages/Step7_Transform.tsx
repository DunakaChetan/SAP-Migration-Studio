import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMigration } from '@/store/migration-store';
import { useToast } from '@/components/ui/toast';
import { useLoading } from '@/components/ui/loading-overlay';
import { OBJS } from '@/data/sap-schemas';
import { ai, parseAI } from '@/services/ai-service';
import { dl, expCSV } from '@/lib/utils';
import { PageLayout, PageGrid, GridCol, Card, CardHeader, CardBody, Button, StatBox, StatsGrid, DataTable, PageHeader, EmptyState, AIResponse } from '@/components/shared';
import { ArrowLeft, ArrowRight, Bot, Cog, Download } from 'lucide-react';

export function Step7Transform() {
  const { state, dispatch } = useMigration();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { showLoad, tick, hideLoad } = useLoading();
  const [aiRules, setAiRules] = useState('');
  const [sidebarRules, setSidebarRules] = useState('');
  const has = state.transformed.length > 0;

  const updateField = (field: string, value: string) => {
    dispatch({ type: 'SET_FIELD', field: field as keyof typeof state, value });
  };

  async function doAITransform() {
    const src = state.cleaned.length ? state.cleaned : state.harmonized;
    if (!src.length) { toast('Run cleansing first', 'err'); return; }
    showLoad('AI Transform Analysis…', '', ['Analyzing patterns…', 'Generating rules…']);
    setTimeout(() => tick(0, 'Patterns analyzed'), 600);
    try {
      const r = await ai(
        `For SAP ${state.obj} migration, generate 6 specific transformation rules for these fields.\nSample: ${JSON.stringify(src.slice(0, 2))}\nConfig: CC=${state.cc}, Plant=${state.plant}, Curr=${state.curr}\nJSON: [{"field":"SAP_FIELD","rule":"description","default":"value_if_empty"}]`,
        state.aiLog
      );
      tick(1, 'Rules generated');
      setTimeout(() => {
        hideLoad();
        const res = parseAI(r);
        if (res && Array.isArray(res)) {
          setSidebarRules(
            (res as Record<string, string>[]).map((x) =>
              `${x.field}: ${x.rule}${x.default ? ` [default: ${x.default}]` : ''}`
            ).join('\n')
          );
          setAiRules(
            (res as Record<string, string>[]).map((x) =>
              `${x.field}: ${x.rule}${x.default ? ' — default: ' + x.default : ''}`
            ).join('\n')
          );
        }
      }, 1500);
    } catch {
      hideLoad();
      toast('AI unavailable, run transform anyway', 'info');
    }
  }

  function doTransform() {
    const src = state.cleaned.length ? state.cleaned : state.harmonized;
    if (!src.length) { toast('Run cleansing first', 'err'); return; }
    showLoad('Transforming…', 'Applying org defaults and SAP formatting', [
      'Applying field mapping…', 'Setting org defaults…', 'Applying SAP defaults…', 'Final format pass…',
    ]);
    [0, 1, 2, 3].forEach((i) => setTimeout(() => tick(i), 400 + i * 400));
    setTimeout(() => {
      const transformed = src.map((row) => {
        const out: Record<string, string> = {};
        (OBJS[state.obj]?.fields || []).forEach((f) => {
          let v = row[f.n] !== undefined ? row[f.n] : '';
          if (!String(v).trim()) {
            if (f.n === 'BUKRS') v = state.cc || '1000';
            else if (f.n === 'VKORG') v = state.so || '1000';
            else if (f.n === 'EKORG') v = state.po || '1000';
            else if (f.n === 'WERKS') v = state.plant || '1000';
            else if (f.n === 'VTWEG') v = state.distch || '10';
            else if (f.n === 'SPART') v = state.spart || '00';
            else if (f.t === 'CUKY' || f.n === 'WAERS') v = state.curr || 'INR';
            else if (f.n === 'KTOKD') v = 'KUNA';
            else if (f.n === 'KTOKK') v = 'LIEF';
            else if (f.n === 'DATBI') v = '99991231';
            else if (f.n === 'MBRSH') v = 'M';
          }
          out[f.n] = v;
        });
        return out;
      });
      hideLoad();
      dispatch({ type: 'SET_FIELD', field: 'transformed', value: transformed });
      toast(`Transformed ${transformed.length} records`, 'ok');
    }, 2200);
  }

  return (
    <PageLayout>
      <PageGrid>

      {/* Left Column */}
      <GridCol span={3}>
        <Card>
          <CardHeader title="Transform Config" />
          <CardBody className="p-3 space-y-3">
        <div className="space-y-2.5 px-1">
          {[['Company Code','cc','1000'],['Sales Org','so','1000'],['Purch Org','po','1000'],['Plant','plant','1000'],['Dist Channel','distch','10'],['Division (Spart)','spart','00'],['Currency','curr','INR']].map(([l,k,d]) => (
            <div key={k}>
              <label className="font-mono text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] mb-1 block">{l}</label>
              <input type="text" value={(state as unknown as Record<string, unknown>)[k] as string || d} onChange={(e) => updateField(k, e.target.value)} className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-tertiary)] px-3 py-2 text-[12px] text-[var(--text-primary)] outline-none focus:border-primary-500 transition-colors" />
            </div>
          ))}
        </div>
        <div className="border-t border-[var(--border)] my-3" />
        <div className="text-[10px] text-[var(--text-tertiary)] px-1 whitespace-pre-wrap">
          {sidebarRules || 'Click AI Rules for custom transforms'}
        </div>
          </CardBody>
        </Card>
      </GridCol>

      {/* Middle Column */}
      <GridCol span={6}>
        <PageHeader title="Step 7 — Data Transformation" subtitle="Apply org defaults, derive missing values, format to SAP S/4HANA standard">
          <Button variant="secondary" icon={<ArrowLeft className="w-3.5 h-3.5" />} onClick={() => navigate('/cleanse')}>Back</Button>
          <Button variant="cyan" icon={<Bot className="w-3.5 h-3.5" />} onClick={doAITransform}>AI Transform Rules</Button>
          <Button variant="success" icon={<Cog className="w-3.5 h-3.5" />} onClick={doTransform}>Run Transform</Button>
          <Button variant="primary" icon={<ArrowRight className="w-3.5 h-3.5" />} onClick={() => navigate('/export')} disabled={!has}>Next: DMC Export</Button>
        </PageHeader>

        {has && (
          <StatsGrid>
            <StatBox value={state.transformed.length} label="Transformed" color="var(--color-success)" />
            <StatBox value={Object.keys(state.transformed[0] || {}).length} label="SAP Fields" color="var(--color-primary-500)" />
            <StatBox value={state.mapping.filter((m) => m.tr && m.tr !== 'none').length} label="Transforms" color="var(--color-teal)" />
            <StatBox value="✓" label="DMC Ready" color="var(--color-warning)" />
          </StatsGrid>
        )}

        <Card>
          <CardHeader title="Final SAP-Format Data">
            {has && <Button variant="secondary" size="sm" icon={<Download className="w-3 h-3" />} onClick={() => dl(expCSV(state.transformed), 'transformed.csv', 'text/csv')} className="ml-auto">Export</Button>}
          </CardHeader>
          <CardBody>
            {has ? <DataTable rows={state.transformed.slice(0, 8)} cols={(OBJS[state.obj]?.fields || []).map((f) => f.n)} /> : <EmptyState icon={<Cog className="w-10 h-10 text-primary-500" />} message="Run transformation to generate SAP-format data" />}
          </CardBody>
        </Card>

        {aiRules && (
          <Card>
            <CardHeader title="AI Transform Rules" />
            <CardBody><AIResponse>{aiRules}</AIResponse></CardBody>
          </Card>
        )}
      </GridCol>

      {/* Right Column */}
      <GridCol span={3}>
        <Card>
          <CardBody className="p-3 space-y-4">
        {[['1. Org defaults','BUKRS/VKORG/WERKS'],['2. SAP defaults','VTWEG=10 SPART=00'],['3. AI custom rules','Pattern derivations'],['4. DMC-ready flag','Mark for export']].map(([n,d]) => (
          <div key={n} className="flex gap-2 px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--bg-tertiary)]/50">
            <span className="font-mono text-[10px] text-primary-500 shrink-0 mt-0.5">{n.split('.')[0]}.</span>
            <div>
              <div className="text-[11.5px] font-bold text-[var(--text-primary)]">{n.split('. ')[1]}</div>
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
