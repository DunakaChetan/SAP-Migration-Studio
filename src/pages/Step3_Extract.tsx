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
import { ArrowLeft, ArrowRight, Zap, Download, Plug, ClipboardList, Filter, UploadCloud, CheckCircle2, RefreshCw, AlertTriangle, Activity, CheckCircle, Save } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, CartesianGrid, AreaChart, Area, ComposedChart, Line, PieChart, Pie, Legend } from 'recharts';
import { toJpeg } from 'html-to-image';
import { jsPDF } from 'jspdf';

export function Step3Extract() {
  const reportRef = React.useRef<HTMLDivElement>(null);
  const { state, dispatch } = useMigration();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { showLoad, tick, hideLoad } = useLoading();
  const [mode, setMode] = useState('full');

  const saveDataToDB = async () => {
    if (!state.projectId) {
      toast('No project ID found. Please create a project first.', 'err');
      return;
    }
    
    showLoad('Saving data...', 'Persisting extracted records to database');
    try {
      const res = await fetch('/api/sap/extract/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: state.projectId,
          target_object: state.obj,
          payload: state.extracted
        })
      });
      
      if (!res.ok) throw new Error('Failed to save data');
      
      
      hideLoad();
      dispatch({ type: 'SET_FIELD', field: 'isDataSaved', value: true });
      toast('Extracted data saved to database successfully!', 'ok');
    } catch (err: any) {
      hideLoad();
      toast(err.message || 'Failed to save data', 'err');
    }
  };

  const has = state.extracted.length > 0;

  async function doExtract() {
    if (!state.mapping.length) { toast('Generate mapping first', 'err'); return; }
    dispatch({ type: 'SET_FIELD', field: 'isDataSaved', value: false });

    if (state.src === 'SAP_ECC') {
      showLoad('Extracting from SAP…', 'Connecting to live system and generating AI Quality Report', [
        'Connecting source…', 'Running $select query…', 'Applying mapping…', 'Running transforms…', 'AI EDA analysis…',
      ]);
      [0, 1, 2, 3].forEach((i) => setTimeout(() => tick(i), 400 + i * 500));

      try {
        const objName = state.obj === 'CUSTOMER' ? 'Customer' : state.obj === 'VENDOR' ? 'Vendor' : 'Material';
        const res = await fetch('/api/sap/extract/execute', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            base_url: state.connUrl,
            client: state.connClient,
            username: state.connUser,
            password: state.connPass,
            target_object: objName,
            mappings: state.mapping,
            system_type: state.src
          })
        });

        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.detail || 'Extraction failed');
        }

        const data = await res.json();
        tick(4, 'AI analysis done');

        setTimeout(() => {
          hideLoad();
          dispatch({ type: 'SET_FIELD', field: 'extracted', value: data.data || [] });
          dispatch({ type: 'SET_FIELD', field: 'aiReport', value: data.aiAnalysis?.report || 'No quality report generated.' });
          toast(`Extracted ${data.data?.length || 0} records from live SAP`, 'ok');
        }, 1500);
      } catch (err: any) {
        hideLoad();
        toast(err.message, 'err');
      }
    } else if (state.src === 'EXCEL_CSV' || state.src === 'ORACLE_EBS') {
      showLoad('Extracting from File…', 'Processing uploaded data and generating AI Quality Report', [
        'Reading memory…', 'Applying mapping…', 'Running transforms…', 'AI EDA analysis…',
      ]);
      [0, 1, 2, 3].forEach((i) => setTimeout(() => tick(i), 300 + i * 400));

      try {
        const objName = state.obj === 'CUSTOMER' ? 'Customer' : state.obj === 'VENDOR' ? 'Vendor' : 'Material';
        const res = await fetch('/api/sap/extract/execute_file', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            target_object: objName,
            mappings: state.mapping,
            raw_data: state.uploadedData || []
          })
        });

        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.detail || 'File extraction failed');
        }

        const data = await res.json();
        tick(4, 'AI analysis done');

        setTimeout(() => {
          hideLoad();
          dispatch({ type: 'SET_FIELD', field: 'extracted', value: data.data || [] });
          dispatch({ type: 'SET_FIELD', field: 'aiReport', value: data.aiAnalysis?.report || 'No quality report generated.' });
          toast(`Processed ${data.data?.length || 0} records from file`, 'ok');
        }, 1500);
      } catch (err: any) {
        hideLoad();
        toast(err.message, 'err');
      }
    } else {
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
            dispatch({ type: 'SET_FIELD', field: 'aiReport', value: `Quality Score: ${res.score || '?'}/100\n\nIssues Found:\n${((res.issues as string[]) || []).map((i: string) => '• ' + i).join('\n')}\n\nRecommendation: ${res.recommendation || 'Review data before harmonization'}` });
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
  }

  const exportToPDF = async () => {
    if (!reportRef.current) return;

    // Temporarily apply a solid background for the screenshot to prevent transparency issues
    const originalBg = reportRef.current.style.backgroundColor;
    reportRef.current.style.backgroundColor = 'var(--bg-primary)';

    try {
      const imgData = await toJpeg(reportRef.current, {
        quality: 0.85,
        cacheBust: true,
        pixelRatio: 2,
        backgroundColor: '#0f172a' // fallback dark theme background
      });

      const width = reportRef.current.offsetWidth * 2;
      const height = reportRef.current.offsetHeight * 2;

      const pdf = new jsPDF({
        orientation: width > height ? 'landscape' : 'portrait',
        unit: 'px',
        format: [width, height]
      });

      pdf.addImage(imgData, 'JPEG', 0, 0, width, height);
      pdf.save('data-quality-report.pdf');
      toast('PDF downloaded successfully!', 'ok');
    } catch (err) {
      console.error(err);
      toast('Failed to generate PDF', 'err');
    } finally {
      // Restore background
      reportRef.current.style.backgroundColor = originalBg;
    }
  };

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
                    options={[{ value: 'full', label: 'Full Load' }, { value: 'delta', label: 'Delta Load' }, { value: 'sample', label: 'Sample (100 rows)' }]}
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
              {[[<Plug className="w-4 h-4 text-blue-500" />, 'Connect Source', 'Establish connection'], [<ClipboardList className="w-4 h-4 text-emerald-500" />, 'Apply Mapping', 'Use field definitions'], [<Filter className="w-4 h-4 text-amber-500" />, 'Apply Filters', 'WHERE conditions'], [<Download className="w-4 h-4 text-violet-500" />, 'Extract Records', 'Pull matching rows'], [<CheckCircle2 className="w-4 h-4 text-teal-500" />, 'Reconcile Count', 'Verify records']].map(([ico, t, s], i) => (
                <PipelineStep key={i} icon={ico} title={t as string} subtitle={s as string} done={has} />
              ))}
            </CardBody>
          </Card>
        </GridCol>

        {/* Middle Column */}
        <GridCol span={6}>
          <PageHeader title="Step 3 — Data Extraction" subtitle="Pull legacy data and validate against AI Mapping schemas">
            <Button variant="secondary" icon={<ArrowLeft className="w-3.5 h-3.5" />} onClick={() => navigate('/mapping')}>Back</Button>
            <div title={state.mapping.length === 0 ? "You must complete Step 2 (AI Mapping) before extracting data." : ""}>
              <Button variant="cyan" icon={<RefreshCw className="w-3.5 h-3.5" />} onClick={doExtract} disabled={state.mapping.length === 0}>Run Extraction</Button>
            </div>
            <div title={!has ? "Run an extraction first before saving." : ""}>
              <Button variant="secondary" icon={<Save className="w-3.5 h-3.5" />} onClick={saveDataToDB} disabled={!has}>Save Data</Button>
            </div>
            <div title={!state.isDataSaved ? "You must save your data before proceeding to Step 4." : ""}>
              <Button variant="primary" icon={<ArrowRight className="w-3.5 h-3.5" />} onClick={() => navigate('/harmonize')} disabled={!state.isDataSaved}>Next: Harmonize</Button>
            </div>
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
              {has && (
                <div className="ml-auto flex gap-2">
                  <Button variant="secondary" size="sm" icon={<Download className="w-3 h-3" />} onClick={() => dl(expCSV(state.extracted), 'extracted.csv', 'text/csv')}>Export</Button>
                </div>
              )}
            </CardHeader>
            <CardBody>
              {has ? <DataTable rows={state.extracted.slice(0, 8)} cols={Object.keys(state.extracted[0] || {})} /> : <EmptyState icon={<UploadCloud className="w-10 h-10 text-primary-500" />} message="Run extraction to see mapped data" />}
            </CardBody>
          </Card>


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

      {/* Full Width AI Quality Analysis Dashboard */}
      {state.aiReport && state.aiReport.eda_stats && (
        <div ref={reportRef} className="mt-8 mb-12 animate-fade-in relative p-4 rounded-xl border border-[var(--border)] bg-[var(--bg-primary)]">

          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-xl font-semibold bg-gradient-to-r from-[var(--color-primary-400)] to-teal-400 bg-clip-text text-transparent flex items-center gap-3">
                <Activity className="w-6 h-6 text-[var(--color-primary-500)]" />
                Data Quality Intelligence
              </h2>
              <p className="text-sm text-[var(--text-secondary)] mt-1 ml-9">{state.aiReport.ai_report?.report_title || "Executive Data Quality Report"}</p>
            </div>
            <Button variant="secondary" icon={<Download className="w-4 h-4" />} onClick={exportToPDF}>Export PDF Report</Button>
          </div>

          <div className="grid grid-cols-12 gap-6">

            {/* Left Column: Summary & Actions (Span 4) */}
            <div className="col-span-12 lg:col-span-4 flex flex-col gap-6">

              <div className="bg-[var(--bg-tertiary)] border border-[var(--border-light)] rounded-2xl p-6 shadow-sm relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-primary-500/10 rounded-full blur-3xl -mr-10 -mt-10 pointer-events-none" />
                <h3 className="text-[13px] font-bold text-[var(--text-primary)] uppercase tracking-wider mb-4 flex items-center gap-2">
                  <ClipboardList className="w-4 h-4 text-primary-500" /> Executive Summary
                </h3>
                <p className="text-[13px] leading-relaxed text-[var(--text-secondary)] relative z-10">
                  {state.aiReport.ai_report?.executive_summary}
                </p>
              </div>

              {state.aiReport.ai_report?.critical_warnings?.length > 0 && (
                <div className="bg-red-500/5 border border-red-500/20 rounded-2xl p-6 relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-24 h-24 bg-red-500/10 rounded-full blur-2xl -mr-5 -mt-5 pointer-events-none" />
                  <h3 className="text-[13px] font-bold text-red-500 uppercase tracking-wider mb-4 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4" /> Critical Risks
                  </h3>
                  <div className="space-y-3 relative z-10">
                    {state.aiReport.ai_report.critical_warnings.map((w: string, i: number) => (
                      <div key={i} className="flex gap-3 text-[13px] text-red-400/90 leading-tight">
                        <div className="mt-0.5 shrink-0 w-1.5 h-1.5 rounded-full bg-red-500" />
                        <span>{w.replace(/^\*\*(.*?)\*\*/, '$1').replace(/^\*/, '').trim()}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="bg-gradient-to-br from-[var(--bg-tertiary)] to-[var(--bg-secondary)] border border-[var(--border-light)] rounded-2xl p-6">
                <h3 className="text-[13px] font-bold text-[var(--text-primary)] uppercase tracking-wider mb-5 flex items-center gap-2">
                  <Zap className="w-4 h-4 text-amber-500" /> Action Plan
                </h3>
                <div className="space-y-4">
                  {(state.aiReport.ai_report?.recommendations || []).map((r: string, i: number) => {
                    const match = r.match(/^\*\*(.*?)\*\*(.*)/);
                    const title = match ? match[1] : `Action ${i + 1}`;
                    const desc = match ? match[2] : r;
                    return (
                      <div key={i} className="flex gap-3 items-start bg-[var(--bg-primary)]/50 p-3 rounded-lg border border-[var(--border)]">
                        <CheckCircle className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
                        <div>
                          <div className="text-[12px] font-semibold text-[var(--text-primary)] mb-1">{title.replace(':', '')}</div>
                          <div className="text-[11.5px] text-[var(--text-secondary)] leading-relaxed">{desc.trim()}</div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>

            {/* Right Column: Visual Charts (Span 8) */}
            <div className="col-span-12 lg:col-span-8 flex flex-col gap-6">

              {/* Row 1: Donut Chart for Field Health */}
              <div className="bg-[var(--bg-tertiary)] border border-[var(--border-light)] rounded-2xl p-6 shadow-sm flex items-center justify-between">
                <div className="flex-1">
                  <h3 className="text-[13px] font-bold text-[var(--text-primary)] uppercase tracking-wider mb-2">Field Health Distribution</h3>
                  <p className="text-[12px] text-[var(--text-secondary)] leading-relaxed mb-4">
                    Based on completeness and unique cardinality thresholds.
                  </p>
                  <div className="flex flex-col gap-2 text-[12px] font-medium">
                    <span className="flex items-center gap-2"><span className="w-3 h-3 rounded-sm bg-emerald-500" /> Healthy (Null &lt; 10%)</span>
                    <span className="flex items-center gap-2"><span className="w-3 h-3 rounded-sm bg-amber-500" /> Warning (Null 10-50%)</span>
                    <span className="flex items-center gap-2"><span className="w-3 h-3 rounded-sm bg-red-500" /> Critical (Null &gt; 50%)</span>
                  </div>
                </div>

                <div className="w-[200px] h-[200px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Tooltip
                        contentStyle={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-light)', borderRadius: '8px', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                        itemStyle={{ color: 'var(--text-primary)', fontSize: '13px', fontWeight: 'bold' }}
                      />
                      <Pie
                        data={[
                          { name: 'Healthy', value: state.aiReport.eda_stats.filter((f: any) => f.null_percentage <= 10).length, color: '#10b981' },
                          { name: 'Warning', value: state.aiReport.eda_stats.filter((f: any) => f.null_percentage > 10 && f.null_percentage <= 50).length, color: '#f59e0b' },
                          { name: 'Critical', value: state.aiReport.eda_stats.filter((f: any) => f.null_percentage > 50).length, color: '#ef4444' }
                        ].filter(d => d.value > 0)}
                        cx="50%"
                        cy="50%"
                        innerRadius={55}
                        outerRadius={80}
                        paddingAngle={5}
                        dataKey="value"
                        stroke="none"
                      >
                        {state.aiReport.eda_stats.map((entry: any, index: number) => (
                          <Cell key={`cell-${index}`} fill={[
                            { name: 'Healthy', value: state.aiReport.eda_stats.filter((f: any) => f.null_percentage <= 10).length, color: '#10b981' },
                            { name: 'Warning', value: state.aiReport.eda_stats.filter((f: any) => f.null_percentage > 10 && f.null_percentage <= 50).length, color: '#f59e0b' },
                            { name: 'Critical', value: state.aiReport.eda_stats.filter((f: any) => f.null_percentage > 50).length, color: '#ef4444' }
                          ].filter(d => d.value > 0)[index % 3]?.color} />
                        ))}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Row 2: Combination Chart */}
              <div className="bg-[var(--bg-tertiary)] border border-[var(--border-light)] rounded-2xl p-6 shadow-sm flex-1">
                <div className="flex items-center justify-between mb-8">
                  <h3 className="text-[13px] font-bold text-[var(--text-primary)] uppercase tracking-wider">Completeness vs. Cardinality</h3>
                  <div className="flex gap-4 text-[11px] font-medium">
                    <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-blue-500" /> Null % (Bar)</span>
                    <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full border-2 border-emerald-400 bg-emerald-500" /> Unique Values (Line)</span>
                  </div>
                </div>
                <div className="h-[350px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={state.aiReport.eda_stats.slice(0, 12)} margin={{ left: -10, bottom: 20, top: 10, right: 10 }}>
                      <defs>
                        <linearGradient id="barColor" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.9} />
                          <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.4} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border-light)" vertical={false} opacity={0.5} />
                      {/* Shortened X-Axis ticks to prevent overlap */}
                      <XAxis
                        dataKey="field"
                        tick={{ fontSize: 10, fill: 'var(--text-tertiary)' }}
                        tickFormatter={(val) => val.length > 15 ? val.substring(0, 15) + '...' : val}
                        axisLine={false}
                        tickLine={false}
                        dy={10}
                      />
                      <YAxis yAxisId="left" tick={{ fontSize: 11, fill: 'var(--text-tertiary)' }} axisLine={false} tickLine={false} tickFormatter={(val) => `${val}%`} />
                      <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: 'var(--text-tertiary)' }} axisLine={false} tickLine={false} />
                      <Tooltip
                        cursor={{ fill: 'var(--bg-secondary)', opacity: 0.4 }}
                        contentStyle={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-light)', borderRadius: '8px', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                        itemStyle={{ fontSize: '12px', fontWeight: 'bold' }}
                        labelStyle={{ color: 'var(--text-tertiary)', fontSize: '11px', marginBottom: '6px' }}
                      />
                      <Bar yAxisId="left" dataKey="null_percentage" name="Null %" fill="url(#barColor)" radius={[4, 4, 0, 0]} maxBarSize={40} />
                      <Line yAxisId="right" type="monotone" dataKey="unique_count" name="Unique Values" stroke="#10b981" strokeWidth={3} dot={{ r: 4, fill: '#10b981', strokeWidth: 2, stroke: 'var(--bg-primary)' }} activeDot={{ r: 6 }} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </div>

            </div>
          </div>
        </div>
      )}

    </PageLayout>
  );
}
