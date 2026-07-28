import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMigration } from '@/store/migration-store';
import { useToast } from '@/components/ui/toast';
import { useLoading } from '@/components/ui/loading-overlay';
import { OBJS } from '@/data/sap-schemas';
import { TRANSFORMS } from '@/data/lookup-maps';
import { ai, parseAI } from '@/services/ai-service';
import { dl, expCSV } from '@/lib/utils';
import { PageLayout, PageGrid, GridCol, Card, CardHeader, CardBody, Button, StatBox, StatsGrid, DataTable, PipelineStep, PageHeader, EmptyState, AIResponse, CodeBlock, Select } from '@/components/shared';
import { ArrowLeft, ArrowRight, Zap, Download, Plug, ClipboardList, Filter, UploadCloud, CheckCircle2 } from 'lucide-react';

export function Step3Extract() {
  const { state, dispatch } = useMigration();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { showLoad, tick, hideLoad } = useLoading();
  const [aiOutput, setAiOutput] = useState('');
  const [mode, setMode] = useState('full');
  const has = state.extracted.length > 0;

  async function doExtract() {
    if (!state.mapping.length) { toast('Generate mapping first', 'err'); return; }
    showLoad('Extracting…', 'Applying field mapping to source data', [
      'Connecting source…', 'Reading records…', 'Applying mapping…', 'Running transforms…', 'AI quality analysis…',
    ]);
    [0, 1, 2, 3].forEach((i) => setTimeout(() => tick(i), 350 + i * 380));

    const extracted = state.rawData.map((row) => {
      const out: Record<string, string> = {};
      state.mapping.forEach((m) => {
        if (m.src && row[m.src] !== undefined) {
          const fn = TRANSFORMS[m.tr]?.fn || TRANSFORMS.trim.fn;
          out[m.sap] = row[m.src] != null ? fn(row[m.src]) : '';
        }
      });
      return out;
    });

    try {
      const aiR = await ai(
        `Analyze this extracted SAP ${state.obj} data quality. Sample: ${JSON.stringify(extracted.slice(0, 3))}\nIdentify top 5 issues and quality score 0-100. Be specific about SAP field rules.\nRespond JSON: {"score":75,"issues":["issue1","issue2"],"recommendation":"text"}`,
        state.aiLog
      );
      tick(4, 'AI analysis done');
      setTimeout(() => {
        hideLoad();
        dispatch({ type: 'SET_FIELD', field: 'extracted', value: extracted });
        const res = parseAI(aiR) as Record<string, unknown> | null;
        if (res) {
          setAiOutput(`Quality Score: ${res.score || '?'}/100\n\nIssues Found:\n${((res.issues as string[]) || []).map((i: string) => '• ' + i).join('\n')}\n\nRecommendation: ${res.recommendation || 'Review data before harmonization'}`);
        }
        toast(`Extracted ${extracted.length} records`, 'ok');
      }, 2400);
    } catch {
      setTimeout(() => {
        hideLoad();
        dispatch({ type: 'SET_FIELD', field: 'extracted', value: extracted });
        toast(`Extracted ${extracted.length} records`, 'ok');
      }, 2000);
    }
  }

  return (
    <PageLayout>
      <PageGrid>

      {/* Left Column */}
      <GridCol span={3}>
        <Card>
          <CardHeader title="Extract Config" />
          <CardBody className="p-3 space-y-3">
        <div className="space-y-2.5 px-1">
          <div>
            <label className="font-mono text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] mb-1 block">Extraction Mode</label>
            <Select
              value={mode}
              onChange={setMode}
              options={[{value: 'full', label: 'Full Load'}, {value: 'delta', label: 'Delta Load'}, {value: 'sample', label: 'Sample (100 rows)'}]}
            />
          </div>
          <div>
            <label className="font-mono text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] mb-1 block">Filter Condition</label>
            <input type="text" placeholder="e.g. LAND1='IN'" className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-tertiary)] px-3 py-2 text-[12px] text-[var(--text-primary)] outline-none" />
          </div>
          <div>
            <label className="font-mono text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] mb-1 block">Row Limit</label>
            <input type="text" defaultValue="5000" className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-tertiary)] px-3 py-2 text-[12px] text-[var(--text-primary)] outline-none" />
          </div>
        </div>
        <div className="border-t border-[var(--border)] my-3" />
        <div className="text-[10.5px] font-semibold text-[var(--text-secondary)] mb-2 px-1">Pipeline Status</div>
        {[[<Plug className="w-4 h-4 text-blue-500"/>,'Connect Source','Establish connection'],[<ClipboardList className="w-4 h-4 text-emerald-500"/>,'Apply Mapping','Use field definitions'],[<Filter className="w-4 h-4 text-amber-500"/>,'Apply Filters','WHERE conditions'],[<Download className="w-4 h-4 text-violet-500"/>,'Extract Records','Pull matching rows'],[<CheckCircle2 className="w-4 h-4 text-teal-500"/>,'Reconcile Count','Verify records']].map(([ico,t,s], i) => (
          <PipelineStep key={i} icon={ico} title={t as string} subtitle={s as string} done={has} />
        ))}
          </CardBody>
        </Card>
      </GridCol>

      {/* Middle Column */}
      <GridCol span={6}>
        <PageHeader title="Step 3 — Extract Engine" subtitle="Pull data based on mapping, preserving exact source values">
          <Button variant="secondary" icon={<ArrowLeft className="w-3.5 h-3.5" />} onClick={() => navigate('/mapping')}>Back</Button>
          <Button variant="cyan" icon={<Download className="w-3.5 h-3.5" />} onClick={doExtract}>Run Extraction</Button>
          <Button variant="primary" icon={<ArrowRight className="w-3.5 h-3.5" />} onClick={() => navigate('/harmonize')} disabled={!has}>Next: Harmonize</Button>
        </PageHeader>

        {has && (
          <StatsGrid>
            <StatBox value={state.extracted.length} label="Records Extracted" subtitle="Source rows" color="var(--color-primary-500)" />
            <StatBox value={state.headers.length} label="Source Columns" color="var(--color-teal)" />
            <StatBox value={state.mapping.length} label="Fields Mapped" color="var(--color-success)" />
            <StatBox value={state.mapping.filter((m) => m.tr && m.tr !== 'none').length} label="Transforms" color="var(--color-warning)" />
          </StatsGrid>
        )}

        <Card>
          <CardHeader title="Extracted Data">
            {has && <Button variant="secondary" size="sm" icon={<Download className="w-3 h-3" />} onClick={() => dl(expCSV(state.extracted), 'extracted.csv', 'text/csv')} className="ml-auto">Export</Button>}
          </CardHeader>
          <CardBody>
            {has ? <DataTable rows={state.extracted.slice(0, 8)} cols={Object.keys(state.extracted[0] || {})} /> : <EmptyState icon={<UploadCloud className="w-10 h-10 text-primary-500" />} message="Run extraction to see mapped data" />}
          </CardBody>
        </Card>

        {aiOutput && (
          <Card>
            <CardHeader title="AI Quality Analysis" />
            <CardBody><AIResponse>{aiOutput}</AIResponse></CardBody>
          </Card>
        )}
      </GridCol>

      {/* Right Column */}
      <GridCol span={3}>
        <Card>
          <CardBody className="p-3 space-y-4">
        <div className="text-[11.5px] font-bold text-[var(--text-secondary)] mb-2">SQL Preview</div>
        <CodeBlock>
          <span className="text-primary-500">SELECT</span><br />
          &nbsp;&nbsp;<span className="text-teal-500">{(state.headers.slice(0, 5) || ['*']).join(',\n  ')}</span><br />
          <span className="text-primary-500">FROM</span> <span className="text-emerald-500">SOURCE_TABLE</span><br />
          <span className="text-primary-500">WHERE</span> 1=1<br />
          <span className="text-primary-500">FETCH FIRST</span> <span className="text-amber-500">5000</span> <span className="text-primary-500">ROWS</span>
        </CodeBlock>
        <div className="text-[11.5px] font-bold text-[var(--text-secondary)] mt-3 mb-2">ABAP RFC Extract</div>
        <CodeBlock className="text-[9.5px]">
          <span className="text-[var(--text-tertiary)]">"* SAP ECC RFC</span><br />
          <span className="text-primary-500">CALL FUNCTION</span> <span className="text-emerald-500">'RFC_READ_TABLE'</span><br />
          &nbsp;<span className="text-primary-500">EXPORTING</span><br />
          &nbsp;&nbsp;QUERY_TABLE = <span className="text-emerald-500">'KNA1'</span><br />
          &nbsp;<span className="text-primary-500">TABLES</span><br />
          &nbsp;&nbsp;DATA = lt_data.
        </CodeBlock>
          </CardBody>
        </Card>
      </GridCol>
          
      </PageGrid>
    </PageLayout>
  );
}
