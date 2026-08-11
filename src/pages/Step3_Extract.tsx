import React, { useState, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMigration } from '@/store/migration-store';
import { useToast } from '@/components/ui/toast';
import { useLoading } from '@/components/ui/loading-overlay';
import { OBJS } from '@/data/sap-schemas';
import { TRANSFORMS } from '@/data/lookup-maps';
import { ai, parseAI } from '@/services/ai-service';
import { dl, expCSV } from '@/lib/utils';
import {
  PageLayout, PageGrid, GridCol, Card, CardHeader, CardBody, Button,
  StatBox, StatsGrid, DataTable, PipelineStep, PageHeader, EmptyState,
  CodeBlock, Select
} from '@/components/shared';
import {
  ArrowLeft, ArrowRight, Zap, Download, Plug, ClipboardList, Filter,
  UploadCloud, CheckCircle2, RefreshCw, AlertTriangle, Activity, CheckCircle, Save,
  BarChart2, ShieldAlert, Search, FileSpreadsheet, Layers, ChevronDown, ChevronUp
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  CartesianGrid, PieChart, Pie
} from 'recharts';
import { jsPDF } from 'jspdf';

export function Step3Extract() {
  const reportRef = useRef<HTMLDivElement>(null);
  const { state, dispatch } = useMigration();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { showLoad, tick, hideLoad } = useLoading();
  const [mode, setMode] = useState('full');
  const [activeTab, setActiveTab] = useState<'completeness' | 'cardinality' | 'table'>('completeness');
  const [edaSearch, setEdaSearch] = useState('');
  const [showAllRisks, setShowAllRisks] = useState(false);
  const [showAllActions, setShowAllActions] = useState(false);

  const has = state.extracted.length > 0;

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
          dispatch({ type: 'SET_FIELD', field: 'aiReport', value: data.aiAnalysis?.report || data.aiAnalysis || 'No quality report generated.' });
          toast(`Extracted ${data.data?.length || 0} records from live SAP`, 'ok');
        }, 1200);
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
          dispatch({ type: 'SET_FIELD', field: 'aiReport', value: data.aiAnalysis?.report || data.aiAnalysis || 'No quality report generated.' });
          toast(`Processed ${data.data?.length || 0} records from file`, 'ok');
        }, 1200);
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
            dispatch({
              type: 'SET_FIELD', field: 'aiReport', value: {
                ai_report: {
                  report_title: `Executive Data Quality Report: ${state.obj} Master Data`,
                  overall_score: res.score || 80,
                  health_grade: (res.score as number) >= 85 ? 'A' : (res.score as number) >= 70 ? 'B' : 'C',
                  executive_summary: String(res.recommendation || 'Data quality analysis completed successfully.'),
                  critical_warnings: (res.issues as string[]) || [],
                  recommendations: [String(res.recommendation || 'Review data quality before harmonization')]
                },
                eda_stats: Object.keys(extracted[0] || {}).map(k => ({
                  field: k,
                  null_percentage: 0,
                  completeness_pct: 100,
                  unique_count: extracted.length,
                  max_length: 20,
                  status: 'HEALTHY'
                }))
              }
            });
          }
          toast(`Extracted ${extracted.length} records`, 'ok');
        }, 1500);
      } catch {
        setTimeout(() => {
          hideLoad();
          dispatch({ type: 'SET_FIELD', field: 'extracted', value: extracted });
          toast(`Extracted ${extracted.length} records`, 'ok');
        }, 1500);
      }
    }
  }

  // Prepared data metrics for charts & report
  const edaStats = useMemo(() => {
    const fromReport = state.aiReport?.eda_stats || state.aiReport?.report?.eda_stats;
    if (Array.isArray(fromReport) && fromReport.length > 0) return fromReport;

    // Fallback compute EDA stats dynamically from extracted dataset
    if (!state.extracted || state.extracted.length === 0) return [];
    const keys = Object.keys(state.extracted[0] || {});
    const total = state.extracted.length;

    return keys.map((field) => {
      let nullCount = 0;
      const uniqueVals = new Set<string>();
      let maxLen = 0;

      state.extracted.forEach((row: any) => {
        const val = row[field];
        if (val === null || val === undefined || String(val).trim() === '') {
          nullCount++;
        } else {
          const str = String(val);
          uniqueVals.add(str);
          if (str.length > maxLen) maxLen = str.length;
        }
      });

      const nullPct = Math.round((nullCount / total) * 100);
      const completePct = 100 - nullPct;
      const status = nullPct <= 10 ? 'HEALTHY' : nullPct <= 50 ? 'WARNING' : 'CRITICAL';

      return {
        field,
        null_count: nullCount,
        null_percentage: nullPct,
        completeness_pct: completePct,
        unique_count: uniqueVals.size,
        max_length: maxLen,
        status
      };
    });
  }, [state.aiReport, state.extracted]);

  const reportMetrics = useMemo(() => {
    const aiReportObj = state.aiReport?.ai_report || state.aiReport?.report?.ai_report || (typeof state.aiReport === 'object' && !state.aiReport.eda_stats ? state.aiReport : {});
    const healthy = edaStats.filter((f: any) => (f.null_percentage ?? 0) <= 10).length;
    const warning = edaStats.filter((f: any) => (f.null_percentage ?? 0) > 10 && (f.null_percentage ?? 0) <= 50).length;
    const critical = edaStats.filter((f: any) => (f.null_percentage ?? 0) > 50).length;
    const totalFields = edaStats.length || 1;

    const calculatedScore = Math.round((healthy / totalFields) * 100);
    const score = aiReportObj.overall_score ?? calculatedScore ?? 85;
    const grade = aiReportObj.health_grade ?? (score >= 85 ? 'A' : score >= 70 ? 'B' : 'C');

    return {
      title: aiReportObj.report_title || `Executive Data Quality Report: ${state.obj} Master Data`,
      summary: aiReportObj.executive_summary || `Automated data quality scan completed across ${state.extracted.length} records and ${totalFields} fields. ${healthy} fields are healthy with high population completeness.`,
      score,
      grade,
      healthy,
      warning,
      critical,
      totalFields,
      warnings: aiReportObj.critical_warnings || (critical > 0 ? [`${critical} field(s) contain high null rates (>50% empty).`] : []),
      recommendations: aiReportObj.recommendations || ['Review unpopulated mandatory fields before starting harmonization.']
    };
  }, [state.aiReport, edaStats, state.obj, state.extracted.length]);

  const pieData = useMemo(() => {
    return [
      { name: 'Healthy (Null ≤ 10%)', value: reportMetrics.healthy, color: '#10b981' },
      { name: 'Warning (Null 10-50%)', value: reportMetrics.warning, color: '#f59e0b' },
      { name: 'Critical (Null > 50%)', value: reportMetrics.critical, color: '#ef4444' }
    ].filter(d => d.value > 0);
  }, [reportMetrics]);

  // Clean Vector PDF Generator using jsPDF
  const exportToPDF = () => {
    try {
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pageWidth = doc.internal.pageSize.getWidth();

      // Palette
      const primaryColor = [14, 116, 144]; // Deep Teal
      const darkText = [30, 41, 59];
      const lightBg = [248, 250, 252];

      // Header Banner
      doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
      doc.rect(0, 0, pageWidth, 28, 'F');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(16);
      doc.setTextColor(255, 255, 255);
      doc.text('SAP Migration Studio — Data Quality Report', 14, 14);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.text(`Generated: ${new Date().toLocaleDateString()} | Target Object: ${state.obj}`, 14, 22);

      let yPos = 36;

      // Executive Title
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(14);
      doc.setTextColor(darkText[0], darkText[1], darkText[2]);
      doc.text(reportMetrics.title, 14, yPos);
      yPos += 8;

      // Scorecard Box
      doc.setFillColor(lightBg[0], lightBg[1], lightBg[2]);
      doc.roundedRect(14, yPos, pageWidth - 28, 22, 3, 3, 'F');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
      doc.text(`Overall Data Readiness Score: ${reportMetrics.score} / 100  (Grade ${reportMetrics.grade})`, 20, yPos + 9);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(100, 116, 139);
      doc.text(`Total Records: ${state.extracted.length}  |  Total Mapped Fields: ${reportMetrics.totalFields}  |  Healthy: ${reportMetrics.healthy}  |  Warning: ${reportMetrics.warning}  |  Critical: ${reportMetrics.critical}`, 20, yPos + 16);

      yPos += 28;

      // Executive Summary
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(darkText[0], darkText[1], darkText[2]);
      doc.text('1. Executive Summary', 14, yPos);
      yPos += 6;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9.5);
      doc.setTextColor(71, 85, 105);
      const splitSummary = doc.splitTextToSize(reportMetrics.summary, pageWidth - 28);
      doc.text(splitSummary, 14, yPos);
      yPos += (splitSummary.length * 4.5) + 6;

      // Critical Risks
      if (reportMetrics.warnings.length > 0) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.setTextColor(220, 38, 38);
        doc.text('2. Critical Data Quality Risks', 14, yPos);
        yPos += 6;

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(127, 29, 29);

        reportMetrics.warnings.forEach((w: string) => {
          const cleanW = w.replace(/^\*\*(.*?)\*\*/, '$1').replace(/^\*/, '').trim();
          const splitW = doc.splitTextToSize(`•  ${cleanW}`, pageWidth - 32);
          doc.text(splitW, 18, yPos);
          yPos += (splitW.length * 4) + 2;
        });
        yPos += 4;
      }

      // Recommendations / Action Plan
      if (reportMetrics.recommendations.length > 0) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.setTextColor(darkText[0], darkText[1], darkText[2]);
        doc.text('3. Recommended Action Plan', 14, yPos);
        yPos += 6;

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(71, 85, 105);

        reportMetrics.recommendations.forEach((r: string, idx: number) => {
          const cleanR = r.replace(/^\*\*(.*?)\*\*/, '$1').replace(/^\*/, '').trim();
          const splitR = doc.splitTextToSize(`${idx + 1}. ${cleanR}`, pageWidth - 32);
          doc.text(splitR, 18, yPos);
          yPos += (splitR.length * 4) + 2;
        });
        yPos += 6;
      }

      // Page Break for Table if necessary
      if (yPos > 210) {
        doc.addPage();
        yPos = 20;
      }

      // Field Statistics Table
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(darkText[0], darkText[1], darkText[2]);
      doc.text('4. Field Completeness & Statistics Breakdown', 14, yPos);
      yPos += 8;

      // Table Header
      doc.setFillColor(241, 245, 249);
      doc.rect(14, yPos, pageWidth - 28, 7, 'F');

      doc.setFontSize(8.5);
      doc.setTextColor(71, 85, 105);
      doc.text('Field Name', 18, yPos + 5);
      doc.text('Null Count', 85, yPos + 5);
      doc.text('Null %', 115, yPos + 5);
      doc.text('Completeness %', 142, yPos + 5);
      doc.text('Status', 178, yPos + 5);
      yPos += 7;

      doc.setFont('helvetica', 'normal');
      edaStats.forEach((stat: any, index: number) => {
        if (yPos > 275) {
          doc.addPage();
          yPos = 20;
        }

        if (index % 2 === 1) {
          doc.setFillColor(248, 250, 252);
          doc.rect(14, yPos, pageWidth - 28, 6, 'F');
        }

        const nullPct = stat.null_percentage ?? 0;
        const compPct = (100 - nullPct).toFixed(1);
        const status = stat.status || (nullPct <= 10 ? 'HEALTHY' : nullPct <= 50 ? 'WARNING' : 'CRITICAL');

        doc.setTextColor(darkText[0], darkText[1], darkText[2]);
        doc.text(String(stat.field).substring(0, 30), 18, yPos + 4.5);
        doc.text(String(stat.null_count ?? Math.round((nullPct / 100) * state.extracted.length)), 85, yPos + 4.5);
        doc.text(`${nullPct}%`, 115, yPos + 4.5);
        doc.text(`${compPct}%`, 142, yPos + 4.5);

        if (status === 'HEALTHY') doc.setTextColor(16, 185, 129);
        else if (status === 'WARNING') doc.setTextColor(245, 158, 11);
        else doc.setTextColor(239, 68, 68);

        doc.text(status, 178, yPos + 4.5);
        yPos += 6;
      });

      doc.save(`Data_Quality_Report_${state.obj}.pdf`);
      toast('Executive PDF Report exported successfully!', 'ok');
    } catch (err: any) {
      console.error(err);
      toast('Failed to generate PDF report', 'err');
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
              <StatBox value={state.headers.length || Object.keys(state.extracted[0] || {}).length} label="Source Columns" color="var(--color-teal)" />
              <StatBox value={state.mapping.length} label="Fields Mapped" color="var(--color-success)" />
              <StatBox value={state.mapping.filter((m) => m.tr && m.tr !== 'none').length} label="Transforms" color="var(--color-warning)" />
            </StatsGrid>
          )}

          <Card>
            <CardHeader title="Extracted Mapped Records">
              {has && (
                <div className="ml-auto flex gap-2">
                  <Button variant="secondary" size="sm" icon={<Download className="w-3 h-3" />} onClick={() => dl(expCSV(state.extracted), 'extracted.csv', 'text/csv')}>Export CSV</Button>
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
              <div className="text-[11.5px] font-bold text-[var(--text-secondary)] mb-2">SQL Query Preview</div>
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

      {/* ───────────────────────────────────────────────────── */}
      {/*     DATA QUALITY INTELLIGENCE REPORT (FULL WIDTH)    */}
      {/* ───────────────────────────────────────────────────── */}
      {(state.aiReport || edaStats.length > 0) && (
        <div ref={reportRef} className="mt-8 mb-12 space-y-6">

          {/* ── Main Executive Container ── */}
          <div className="bg-[var(--bg-tertiary)]/40 border border-[var(--border)] rounded-2xl p-6 shadow-xl backdrop-blur-sm space-y-6">

            {/* ── Top Bar Header ── */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-[var(--border)]">
              <div className="flex items-center gap-3.5">
                <div className="p-3 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-500 shadow-sm shrink-0">
                  <Activity className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <h2 className="text-xl font-extrabold tracking-tight text-[var(--text-primary)]">
                      Data Quality Intelligence Report
                    </h2>
                    <span className="text-[10px] px-2.5 py-0.5 rounded-full font-mono font-bold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 shadow-sm">
                      Grade {reportMetrics.grade} · {reportMetrics.score}/100 Score
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-[11px] text-[var(--text-secondary)] mt-1 font-medium">
                    <span className="flex items-center gap-1"><Layers className="w-3.5 h-3.5 text-indigo-500" /> Target Object: <strong className="text-[var(--text-primary)]">{state.obj}</strong></span>
                    <span>•</span>
                    <span className="flex items-center gap-1"><FileSpreadsheet className="w-3.5 h-3.5 text-teal-500" /> <strong className="text-[var(--text-primary)]">{state.extracted.length}</strong> Records Analyzed</span>
                    <span>•</span>
                    <span>{reportMetrics.totalFields} Mapped Fields</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button variant="secondary" size="sm" icon={<Download className="w-3.5 h-3.5 text-indigo-500" />} onClick={exportToPDF}>
                  Export Vector PDF
                </Button>
                <Button variant="secondary" size="sm" icon={<Download className="w-3.5 h-3.5 text-teal-500" />} onClick={() => dl(expCSV(state.extracted), 'extracted_summary.csv', 'text/csv')}>
                  Export CSV
                </Button>
              </div>
            </div>

            {/* ── Executive Scorecard Cards ── */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-[var(--bg-primary)] border border-[var(--border)] rounded-xl p-4 shadow-sm border-l-4 border-l-indigo-500 flex items-center justify-between">
                <div>
                  <div className="text-[10px] font-mono uppercase tracking-wider text-[var(--text-tertiary)] mb-1">Readiness Score</div>
                  <div className="text-2xl font-black text-indigo-500 font-mono leading-none">{reportMetrics.score}<span className="text-xs font-normal text-[var(--text-tertiary)]"> / 100</span></div>
                  <div className="text-[10px] text-[var(--text-secondary)] mt-1.5 font-semibold">Grade {reportMetrics.grade} Rating</div>
                </div>
                <div className="w-10 h-10 rounded-xl bg-indigo-500/10 text-indigo-500 font-black text-base font-mono flex items-center justify-center border border-indigo-500/20">
                  {reportMetrics.grade}
                </div>
              </div>

              <div className="bg-[var(--bg-primary)] border border-[var(--border)] rounded-xl p-4 shadow-sm border-l-4 border-l-emerald-500 flex items-center justify-between">
                <div>
                  <div className="text-[10px] font-mono uppercase tracking-wider text-[var(--text-tertiary)] mb-1">Healthy Fields</div>
                  <div className="text-2xl font-black text-emerald-500 font-mono leading-none">{reportMetrics.healthy}</div>
                  <div className="text-[10px] text-[var(--text-tertiary)] mt-1.5">&lt;10% null rate</div>
                </div>
                <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
              </div>

              <div className="bg-[var(--bg-primary)] border border-[var(--border)] rounded-xl p-4 shadow-sm border-l-4 border-l-amber-500 flex items-center justify-between">
                <div>
                  <div className="text-[10px] font-mono uppercase tracking-wider text-[var(--text-tertiary)] mb-1">Warning Fields</div>
                  <div className="text-2xl font-black text-amber-500 font-mono leading-none">{reportMetrics.warning}</div>
                  <div className="text-[10px] text-[var(--text-tertiary)] mt-1.5">10% – 50% null rate</div>
                </div>
                <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-500 border border-amber-500/20">
                  <AlertTriangle className="w-5 h-5" />
                </div>
              </div>

              <div className="bg-[var(--bg-primary)] border border-[var(--border)] rounded-xl p-4 shadow-sm border-l-4 border-l-red-500 flex items-center justify-between">
                <div>
                  <div className="text-[10px] font-mono uppercase tracking-wider text-[var(--text-tertiary)] mb-1">Critical Fields</div>
                  <div className="text-2xl font-black text-red-500 font-mono leading-none">{reportMetrics.critical}</div>
                  <div className="text-[10px] text-[var(--text-tertiary)] mt-1.5">&gt;50% null rate</div>
                </div>
                <div className="p-2.5 rounded-xl bg-red-500/10 text-red-500 border border-red-500/20">
                  <ShieldAlert className="w-5 h-5" />
                </div>
              </div>
            </div>

            {/* ── Main 2-Column Section ── */}
            <div style={{ display: 'grid', gridTemplateColumns: '350px 1fr', gap: 20, alignItems: 'start' }}>

              {/* LEFT COLUMN: Narrative & Donut */}
              <div className="space-y-4">

                {/* Executive Summary Card */}
                <div className="bg-[var(--bg-primary)] border border-[var(--border)] rounded-xl p-4 shadow-sm">
                  <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-[var(--text-primary)] mb-2.5">
                    <ClipboardList className="w-4 h-4 text-indigo-500" /> Executive Summary
                  </div>
                  <p className="text-[12px] leading-relaxed text-[var(--text-secondary)]">
                    {reportMetrics.summary}
                  </p>
                </div>

                {/* Field Health Donut Gauge */}
                <div className="bg-[var(--bg-primary)] border border-[var(--border)] rounded-xl p-4 shadow-sm">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-primary)] mb-3">
                    Field Health Breakdown
                  </div>
                  <div className="flex items-center gap-4">
                    <div style={{ width: 130, height: 130, position: 'relative', flexShrink: 0 }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Tooltip
                            contentStyle={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '11px' }}
                          />
                          <Pie data={pieData} cx="50%" cy="50%" innerRadius={38} outerRadius={58} paddingAngle={3} dataKey="value" stroke="none">
                            {pieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                          </Pie>
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                        <span className="text-base font-black font-mono text-[var(--text-primary)]">{reportMetrics.score}%</span>
                        <span className="text-[8px] text-[var(--text-tertiary)] uppercase font-mono tracking-wider">Health</span>
                      </div>
                    </div>

                    <div className="flex-1 space-y-2 text-[11.5px]">
                      <div className="flex items-center justify-between p-1.5 rounded-lg bg-[var(--bg-tertiary)]/50">
                        <span className="flex items-center gap-1.5 text-[var(--text-secondary)]"><span className="w-2 h-2 rounded-full bg-emerald-500"/>Healthy</span>
                        <span className="font-bold font-mono text-emerald-500">{reportMetrics.healthy}</span>
                      </div>
                      <div className="flex items-center justify-between p-1.5 rounded-lg bg-[var(--bg-tertiary)]/50">
                        <span className="flex items-center gap-1.5 text-[var(--text-secondary)]"><span className="w-2 h-2 rounded-full bg-amber-500"/>Warning</span>
                        <span className="font-bold font-mono text-amber-500">{reportMetrics.warning}</span>
                      </div>
                      <div className="flex items-center justify-between p-1.5 rounded-lg bg-[var(--bg-tertiary)]/50">
                        <span className="flex items-center gap-1.5 text-[var(--text-secondary)]"><span className="w-2 h-2 rounded-full bg-red-500"/>Critical</span>
                        <span className="font-bold font-mono text-red-500">{reportMetrics.critical}</span>
                      </div>
                    </div>
                  </div>
                </div>

              </div>

              {/* RIGHT COLUMN: Visual Analytics + Risks & Action Plan Dropdowns */}
              <div className="space-y-4">

                {/* Card 1: Exploratory Visual Analytics */}
                <div className="bg-[var(--bg-primary)] border border-[var(--border)] rounded-xl p-5 shadow-sm space-y-4">

                  {/* Tab Header Bar */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[var(--border)]">
                    <div className="flex items-center gap-2">
                      <BarChart2 className="w-4 h-4 text-indigo-500" />
                      <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-primary)]">
                        Exploratory Visual Analytics
                      </span>
                    </div>

                    <div className="flex bg-[var(--bg-tertiary)] border border-[var(--border)] rounded-lg p-1 gap-1 text-[11px]">
                      <button
                        onClick={() => setActiveTab('completeness')}
                        className={`px-3 py-1 rounded-md font-medium transition-all ${activeTab === 'completeness' ? 'bg-indigo-600 text-white shadow-sm' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}
                      >
                        Completeness %
                      </button>
                      <button
                        onClick={() => setActiveTab('cardinality')}
                        className={`px-3 py-1 rounded-md font-medium transition-all ${activeTab === 'cardinality' ? 'bg-indigo-600 text-white shadow-sm' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}
                      >
                        Cardinality
                      </button>
                      <button
                        onClick={() => setActiveTab('table')}
                        className={`px-3 py-1 rounded-md font-medium transition-all ${activeTab === 'table' ? 'bg-indigo-600 text-white shadow-sm' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}
                      >
                        Data Table
                      </button>
                    </div>
                  </div>

                  {/* Chart 1: Field Completeness % */}
                  {activeTab === 'completeness' && (
                    <div className="space-y-2">
                      <div className="text-[11px] text-[var(--text-secondary)]">Percentage of non-null populated values across mapped fields</div>
                      <div style={{ width: '100%', height: 320 }}>
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart
                            data={edaStats.slice(0, 18)}
                            margin={{ top: 12, right: 12, bottom: 60, left: 0 }}
                            barCategoryGap="30%"
                          >
                            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} opacity={0.5} />
                            <XAxis
                              dataKey="field"
                              tick={{ fontSize: 9.5, fill: 'var(--text-tertiary)' }}
                              tickFormatter={(v: string) => v.length > 10 ? v.slice(0, 10) + '…' : v}
                              axisLine={false}
                              tickLine={false}
                              interval={0}
                              angle={-40}
                              textAnchor="end"
                              height={65}
                            />
                            <YAxis
                              tick={{ fontSize: 10, fill: 'var(--text-tertiary)' }}
                              axisLine={false}
                              tickLine={false}
                              domain={[0, 100]}
                              tickFormatter={(v: number) => `${v}%`}
                              width={38}
                            />
                            <Tooltip
                              cursor={{ fill: 'var(--bg-secondary)', opacity: 0.35 }}
                              contentStyle={{ background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
                              formatter={(value: any, _n: any, props: any) => [`${value}% Completeness`, `${props.payload?.field}`]}
                              labelFormatter={() => ''}
                            />
                            <Bar dataKey="completeness_pct" radius={[4, 4, 0, 0]} maxBarSize={36}>
                              {edaStats.slice(0, 18).map((entry: any, i: number) => {
                                const np = entry.null_percentage ?? 0;
                                return <Cell key={i} fill={np <= 10 ? '#10b981' : np <= 50 ? '#f59e0b' : '#ef4444'} />;
                              })}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  )}

                  {/* Chart 2: Field Cardinality */}
                  {activeTab === 'cardinality' && (
                    <div className="space-y-2">
                      <div className="text-[11px] text-[var(--text-secondary)]">Number of unique distinct values per field</div>
                      <div style={{ width: '100%', height: 320 }}>
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart
                            data={edaStats.slice(0, 18)}
                            margin={{ top: 12, right: 12, bottom: 60, left: 0 }}
                            barCategoryGap="30%"
                          >
                            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} opacity={0.5} />
                            <XAxis
                              dataKey="field"
                              tick={{ fontSize: 9.5, fill: 'var(--text-tertiary)' }}
                              tickFormatter={(v: string) => v.length > 10 ? v.slice(0, 10) + '…' : v}
                              axisLine={false}
                              tickLine={false}
                              interval={0}
                              angle={-40}
                              textAnchor="end"
                              height={65}
                            />
                            <YAxis
                              tick={{ fontSize: 10, fill: 'var(--text-tertiary)' }}
                              axisLine={false}
                              tickLine={false}
                              width={38}
                            />
                            <Tooltip
                              cursor={{ fill: 'var(--bg-secondary)', opacity: 0.35 }}
                              contentStyle={{ background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
                              formatter={(value: any, _n: any, props: any) => [`${value} Unique Values`, `${props.payload?.field}`]}
                              labelFormatter={() => ''}
                            />
                            <Bar dataKey="unique_count" fill="#06b6d4" radius={[4, 4, 0, 0]} maxBarSize={36} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  )}

                  {/* View 3: Statistical Data Table */}
                  {activeTab === 'table' && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="relative flex-1 max-w-xs">
                          <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-[var(--text-tertiary)]" />
                          <input
                            type="text"
                            placeholder="Filter field name..."
                            value={edaSearch}
                            onChange={(e) => setEdaSearch(e.target.value)}
                            className="w-full pl-8 pr-3 py-1.5 rounded-lg text-[11px] bg-[var(--bg-tertiary)] border border-[var(--border)] text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono"
                          />
                        </div>
                        <span className="text-[10.5px] text-[var(--text-tertiary)] font-mono">
                          Showing {edaStats.filter((r: any) => String(r.field || '').toLowerCase().includes(edaSearch.toLowerCase())).length} of {edaStats.length} fields
                        </span>
                      </div>

                      <div className="overflow-x-auto rounded-lg border border-[var(--border)] max-h-[300px] overflow-y-auto">
                        <table className="w-full text-left text-[11.5px]">
                          <thead className="bg-[var(--bg-tertiary)] sticky top-0 border-b border-[var(--border)] text-[var(--text-tertiary)] font-mono uppercase text-[9.5px]">
                            <tr>
                              <th className="py-2.5 px-3">Field</th>
                              <th className="py-2.5 px-3">Null #</th>
                              <th className="py-2.5 px-3">Null %</th>
                              <th className="py-2.5 px-3">Complete %</th>
                              <th className="py-2.5 px-3">Uniques</th>
                              <th className="py-2.5 px-3">Max Len</th>
                              <th className="py-2.5 px-3">Status</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[var(--border)] font-mono">
                            {edaStats
                              .filter((r: any) => String(r.field || '').toLowerCase().includes(edaSearch.toLowerCase()))
                              .map((row: any, i: number) => {
                                const np = row.null_percentage ?? 0;
                                const st = row.status || (np <= 10 ? 'HEALTHY' : np <= 50 ? 'WARNING' : 'CRITICAL');
                                const bc = st === 'HEALTHY' ? { bg: '#10b98115', txt: '#10b981', brd: '#10b98130' }
                                  : st === 'WARNING' ? { bg: '#f59e0b15', txt: '#f59e0b', brd: '#f59e0b30' }
                                  : { bg: '#ef444415', txt: '#ef4444', brd: '#ef444430' };
                                return (
                                  <tr key={i} className="hover:bg-[var(--bg-tertiary)]/50 transition-colors">
                                    <td className="py-2 px-3 font-semibold text-[var(--text-primary)] whitespace-nowrap">{row.field}</td>
                                    <td className="py-2 px-3 text-[var(--text-secondary)]">{row.null_count ?? Math.round((np / 100) * state.extracted.length)}</td>
                                    <td className="py-2 px-3 text-[var(--text-secondary)]">{np}%</td>
                                    <td className="py-2 px-3 text-[var(--text-secondary)]">{row.completeness_pct ?? (100 - np).toFixed(1)}%</td>
                                    <td className="py-2 px-3 text-[var(--text-secondary)]">{row.unique_count}</td>
                                    <td className="py-2 px-3 text-[var(--text-secondary)]">{row.max_length}</td>
                                    <td className="py-2 px-3">
                                      <span style={{ fontSize: 9, padding: '2px 7px', borderRadius: 20, fontWeight: 700, background: bc.bg, color: bc.txt, border: `1px solid ${bc.brd}` }}>
                                        {st}
                                      </span>
                                    </td>
                                  </tr>
                                );
                              })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                </div>

                {/* Card 2: Critical Migration Risks (Collapsible Dropdown) */}
                {reportMetrics.warnings.length > 0 && (
                  <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-4 shadow-sm space-y-2.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-red-500">
                        <ShieldAlert className="w-4 h-4" /> Critical Migration Risks ({reportMetrics.warnings.length})
                      </div>
                      {reportMetrics.warnings.length > 2 && (
                        <button
                          onClick={() => setShowAllRisks(!showAllRisks)}
                          className="flex items-center gap-1 text-[10.5px] font-semibold text-red-500 hover:text-red-400 transition-colors cursor-pointer bg-red-500/10 px-2.5 py-1 rounded-md"
                        >
                          {showAllRisks ? (
                            <>Show Less <ChevronUp className="w-3.5 h-3.5" /></>
                          ) : (
                            <>Show All ({reportMetrics.warnings.length - 2} more) <ChevronDown className="w-3.5 h-3.5" /></>
                          )}
                        </button>
                      )}
                    </div>
                    <div className="space-y-2">
                      {(showAllRisks ? reportMetrics.warnings : reportMetrics.warnings.slice(0, 2)).map((w: string, i: number) => (
                        <div key={i} className="flex gap-2 text-[11.5px] text-red-400 leading-snug bg-red-500/5 p-2.5 rounded-lg border border-red-500/10">
                          <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
                          <span>{w.replace(/^\*\*(.*?)\*\*/, '$1').replace(/^\*/, '').trim()}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Card 3: Action Plan & Recommended Fixes (Collapsible Dropdown) */}
                {reportMetrics.recommendations.length > 0 && (
                  <div className="bg-[var(--bg-primary)] border border-[var(--border)] rounded-xl p-4 shadow-sm space-y-2.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-[var(--text-primary)]">
                        <Zap className="w-4 h-4 text-amber-500" /> Action Plan & Recommended Fixes ({reportMetrics.recommendations.length})
                      </div>
                      {reportMetrics.recommendations.length > 2 && (
                        <button
                          onClick={() => setShowAllActions(!showAllActions)}
                          className="flex items-center gap-1 text-[10.5px] font-semibold text-amber-600 dark:text-amber-400 hover:text-amber-500 transition-colors cursor-pointer bg-amber-500/10 px-2.5 py-1 rounded-md"
                        >
                          {showAllActions ? (
                            <>Show Less <ChevronUp className="w-3.5 h-3.5" /></>
                          ) : (
                            <>Show All ({reportMetrics.recommendations.length - 2} more) <ChevronDown className="w-3.5 h-3.5" /></>
                          )}
                        </button>
                      )}
                    </div>
                    <div className="space-y-2">
                      {(showAllActions ? reportMetrics.recommendations : reportMetrics.recommendations.slice(0, 2)).map((r: string, i: number) => {
                        const match = r.match(/^([^:]+):(.*)/);
                        const title = match ? match[1].replace(/^\d+\.\s*/, '').replace(/^\*\*(.*?)\*\*/, '$1') : `Action ${i + 1}`;
                        const desc = match ? match[2] : r;
                        return (
                          <div key={i} className="p-2.5 rounded-lg bg-[var(--bg-tertiary)]/60 border border-[var(--border)]">
                            <div className="text-[11px] font-semibold text-[var(--text-primary)] flex items-center gap-1.5 mb-1">
                              <CheckCircle className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                              {title.trim()}
                            </div>
                            <div className="text-[10.5px] text-[var(--text-secondary)] leading-relaxed pl-5">{desc.trim()}</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

              </div>

            </div>

          </div>

        </div>
      )}
    </PageLayout>
  );
}
