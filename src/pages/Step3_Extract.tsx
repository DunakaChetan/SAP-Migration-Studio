import React, { useState, useMemo, useRef, useEffect } from 'react';
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
  CartesianGrid, ScatterChart, Scatter, ZAxis, Legend,
  ComposedChart, Line, Area, Brush
} from 'recharts';
import { jsPDF } from 'jspdf';

export function Step3Extract() {
  const reportRef = useRef<HTMLDivElement>(null);
  const { state, dispatch } = useMigration();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { showLoad, tick, hideLoad } = useLoading();
  const [rowLimit, setRowLimit] = useState(5000);
  const [activeTab, setActiveTab] = useState<'table' | 'completeness' | 'cardinality' | 'raw'>('table');
  const [edaSearch, setEdaSearch] = useState('');
  const [showAllRisks, setShowAllRisks] = useState(false);
  const [showAllActions, setShowAllActions] = useState(false);
  const [aiSummary, setAiSummary] = useState<any>(null);
  const [aiLoading, setAiLoading] = useState(false);

  const has = state.extracted.length > 0;

  const saveDataToDB = async () => {
    if (!state.projectId) {
      toast('No project ID found. Please create a project first.', 'err');
      return;
    }

    showLoad('Saving data...', 'Persisting extracted records to database');
    try {
      const res = await fetch(`${import.meta.env.VITE_BACKEND_URL}/api/sap/extract/save`, {
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

  const doExtract = async () => {
    if (!state.src) { toast('Please configure a source first.', 'err'); return; }
    if (state.mapping.length === 0) { toast('Please map fields before extracting.', 'err'); return; }

    setAiSummary(null);

    if (state.src === 'LIVE_SAP') {
      showLoad('Extracting from SAP…', 'Connecting to live system and generating AI Quality Report', [
        'Connecting source…', 'Running $select query…', 'Applying mapping…', 'Running transforms…', 'LLM triggered…',
      ]);
      [0, 1, 2, 3].forEach((i) => setTimeout(() => tick(i), 400 + i * 500));

      try {
        const objName = state.obj === 'CUSTOMER' ? 'Customer' : state.obj === 'VENDOR' ? 'Vendor' : 'Material';
        const res = await fetch(`${import.meta.env.VITE_BACKEND_URL}/api/sap/extract/execute`, {
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
        'Reading memory…', 'Applying mapping…', 'Running transforms…', 'LLM triggered…',
      ]);
      [0, 1, 2, 3].forEach((i) => setTimeout(() => tick(i), 300 + i * 400));

      try {
        const objName = state.obj === 'CUSTOMER' ? 'Customer' : state.obj === 'VENDOR' ? 'Vendor' : 'Material';
        const res = await fetch(`${import.meta.env.VITE_BACKEND_URL}/api/sap/extract/execute_file`, {
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
        'Connecting source…', 'Reading records…', 'Applying mapping…', 'Running transforms…', 'LLM triggered…',
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
        tick(4, 'Quality analysis done');
        setTimeout(() => {
          hideLoad();
          dispatch({ type: 'SET_FIELD', field: 'extracted', value: extracted });
          dispatch({ type: 'SET_FIELD', field: 'aiReport', value: null });
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
    if (!state.extracted || state.extracted.length === 0) return [];
    const keys = Object.keys(state.extracted[0] || {});
    const total = state.extracted.length;

    return keys.map((field) => {
      let nullCount = 0;
      let wsCount = 0;
      let numCount = 0;
      let strCount = 0;
      const uniqueVals = new Set<string>();
      let maxLen = 0;
      let minLen = Infinity;

      state.extracted.forEach((row: any) => {
        const val = row[field];
        if (val === null || val === undefined || String(val).trim() === '') {
          nullCount++;
        } else {
          const str = String(val);
          uniqueVals.add(str);
          if (str.length > maxLen) maxLen = str.length;
          if (str.length < minLen) minLen = str.length;
          if (str !== str.trim()) wsCount++;
          if (!isNaN(Number(str))) numCount++;
          else strCount++;
        }
      });

      if (minLen === Infinity) minLen = 0;
      const populatedCount = total - nullCount;
      const isConstant = (uniqueVals.size === 1 && populatedCount > 0);
      const isMixedType = (numCount > 0 && strCount > 0 && populatedCount > 0);
      const isMandatory = !!state.mapping.find(m => m.sap === field)?.req;

      let status = 'HEALTHY';
      if (isMandatory && nullCount > 0) status = 'CRITICAL';
      else if (wsCount > 0 || isMixedType || (!isMandatory && nullCount === total)) status = 'WARNING';

      return {
        field,
        is_mandatory: isMandatory,
        null_count: nullCount,
        populated_count: populatedCount,
        unique_count: uniqueVals.size,
        max_length: maxLen,
        min_length: minLen,
        ws_count: wsCount,
        is_constant: isConstant,
        is_mixed_type: isMixedType,
        status
      };
    });
  }, [state.extracted, state.mapping]);

  const reportMetrics = useMemo(() => {
    const mandatoryFields = edaStats.filter((f: any) => f.is_mandatory);
    const healthy = edaStats.filter((f: any) => f.status === 'HEALTHY').length;
    const warning = edaStats.filter((f: any) => f.status === 'WARNING').length;
    const critical = edaStats.filter((f: any) => f.status === 'CRITICAL').length;
    const totalFields = edaStats.length || 1;
    const totalRecords = state.extracted.length || 1;

    let score = 100;
    if (mandatoryFields.length > 0) {
      const mandatoryErrors = mandatoryFields.reduce((sum, f) => sum + f.null_count, 0);
      const totalMandatoryCells = mandatoryFields.length * totalRecords;
      score = Math.round(((totalMandatoryCells - mandatoryErrors) / totalMandatoryCells) * 100);
    } else {
      const allErrors = edaStats.reduce((sum, f) => sum + f.null_count, 0);
      const totalCells = totalFields * totalRecords;
      score = Math.round(((totalCells - allErrors) / totalCells) * 100);
    }

    const grade = score >= 95 ? 'A' : score >= 80 ? 'B' : 'C';
    
    const warnings: string[] = [];
    edaStats.filter((f: any) => f.is_mandatory && f.null_count > 0).forEach((f: any) => {
      warnings.push(`Mandatory field [${f.field}] has ${f.null_count} missing values.`);
    });
    edaStats.filter((f: any) => f.max_length > 40).forEach((f: any) => {
      warnings.push(`Field [${f.field}] exceeds SAP standard 40-char limit (Max: ${f.max_length}).`);
    });

    const recommendations: string[] = [];
    edaStats.filter((f: any) => f.ws_count > 0).forEach((f: any) => {
      recommendations.push(`Apply TRIM transform on [${f.field}]: ${f.ws_count} records contain invisible whitespace.`);
    });
    edaStats.filter((f: any) => f.is_constant).forEach((f: any) => {
      recommendations.push(`[${f.field}] is a hardcoded constant. Consider removing from payload and defaulting in SAP.`);
    });
    edaStats.filter((f: any) => f.is_mixed_type).forEach((f: any) => {
      recommendations.push(`[${f.field}] contains both text and numbers. Validate data type mapping.`);
    });
    
    if (warnings.length === 0 && recommendations.length === 0) {
       recommendations.push('Data quality looks excellent. Proceed to transformation.');
    }

    return {
      title: `Deterministic Data Quality Report: ${state.obj} Master Data`,
      summary: `Automated deterministic quality scan completed across ${totalRecords} records and ${totalFields} fields. Advanced formatting and length checks applied.`,
      score,
      grade,
      healthy,
      warning,
      critical,
      totalFields,
      warnings,
      recommendations
    };
  }, [edaStats, state.obj, state.extracted.length]);

  useEffect(() => {
    if (edaStats.length > 0 && reportMetrics && !aiLoading && !aiSummary) {
      console.log('LLM triggered');
      setAiLoading(true);
      fetch(`${import.meta.env.VITE_BACKEND_URL}/api/sap/extract/ai_summary`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stats: edaStats.slice(0, 50),
          score: reportMetrics.score,
          total_records: state.extracted.length,
          target_object: state.obj
        })
      }).then(r => r.json()).then(data => {
        if (data.aiAnalysis) setAiSummary(data.aiAnalysis);
      }).catch(e => console.error(e)).finally(() => setAiLoading(false));
    }
  }, [edaStats, reportMetrics]);

  const complianceData = useMemo(() => {
    const mandatory = edaStats.filter((f: any) => f.is_mandatory);
    const optional = edaStats.filter((f: any) => !f.is_mandatory);

    return [
      {
        name: 'Mandatory',
        Healthy: mandatory.filter((f: any) => f.status === 'HEALTHY').length,
        Critical: mandatory.filter((f: any) => f.status === 'CRITICAL').length,
        Warning: 0,
        Total: mandatory.length
      },
      {
        name: 'Optional',
        Healthy: optional.filter((f: any) => f.status === 'HEALTHY').length,
        Warning: optional.filter((f: any) => f.status === 'WARNING').length,
        Critical: 0,
        Total: optional.length
      }
    ].filter(d => d.Total > 0);
  }, [edaStats]);

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

        {/* Main Column */}
        <GridCol span={12}>
          <PageHeader title="Step 3 — Data Extraction" subtitle="Pull legacy data and validate against Mapping schemas">
            <div className="flex items-center gap-2 mr-4">
              <span className="text-[10px] font-mono uppercase tracking-wider text-[var(--text-tertiary)]">Row Limit:</span>
              <input type="number" value={rowLimit} onChange={(e) => setRowLimit(Number(e.target.value))} className="w-20 rounded-md border border-[var(--border)] bg-[var(--bg-tertiary)] px-2 py-1 text-[11px] text-[var(--text-primary)] outline-none" />
            </div>
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
              {has ? <DataTable rows={state.extracted.slice(0, rowLimit)} cols={Object.keys(state.extracted[0] || {})} /> : <EmptyState icon={<UploadCloud className="w-10 h-10 text-primary-500" />} message="Run extraction to see mapped data" />}
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

            {/* ── Main Visual Analytics & Summary ── */}
            <div className="flex flex-col lg:flex-row gap-5 items-start">

              {/* LEFT MAIN: Data Table & Scatter Plot */}
              <div className="flex-1 space-y-4 min-w-0">

                {/* Visual Analytics Container */}
                <div className="bg-[var(--bg-primary)] border border-[var(--border)] rounded-xl p-5 shadow-sm space-y-4">
                  
                  {/* Tab Header Bar */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[var(--border)]">
                    <div className="flex items-center gap-2">
                      <BarChart2 className="w-4 h-4 text-indigo-500" />
                      <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-primary)]">
                        Field-Level Analytics
                      </span>
                    </div>

                    <div className="flex bg-[var(--bg-tertiary)] border border-[var(--border)] rounded-lg p-1 gap-1 text-[11px]">
                      <button
                        onClick={() => setActiveTab('table')}
                        className={`px-3 py-1 rounded-md font-medium transition-all ${activeTab === 'table' ? 'bg-indigo-600 text-white shadow-sm' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}
                      >
                        Data Table
                      </button>
                      <button
                        onClick={() => setActiveTab('completeness')}
                        className={`px-3 py-1 rounded-md font-medium transition-all ${activeTab === 'completeness' ? 'bg-indigo-600 text-white shadow-sm' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}
                      >
                        Populated vs Null
                      </button>
                      <button
                        onClick={() => setActiveTab('cardinality')}
                        className={`px-3 py-1 rounded-md font-medium transition-all ${activeTab === 'cardinality' ? 'bg-indigo-600 text-white shadow-sm' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}
                      >
                        Cardinality
                      </button>
                    </div>
                  </div>

                  {/* Primary Data Table */}
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
                      
                      <div className="overflow-x-auto rounded-lg border border-[var(--border)] max-h-[400px] overflow-y-auto">
                        <table className="w-full text-left text-[11.5px]">
                          <thead className="bg-[var(--bg-tertiary)] sticky top-0 border-b border-[var(--border)] text-[var(--text-tertiary)] font-mono uppercase text-[9.5px]">
                            <tr>
                              <th className="py-2.5 px-3">Field</th>
                              <th className="py-2.5 px-3 w-16">Mandatory</th>
                              <th className="py-2.5 px-3 min-w-[120px]">Populated vs Null</th>
                              <th className="py-2.5 px-3">Uniques</th>
                              <th className="py-2.5 px-3 min-w-[120px]">Format Anomalies</th>
                              <th className="py-2.5 px-3">Status</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[var(--border)] font-mono">
                            {edaStats
                              .filter((r: any) => String(r.field || '').toLowerCase().includes(edaSearch.toLowerCase()))
                              .map((row: any, i: number) => {
                              const st = row.status || 'HEALTHY';
                              const bc = st === 'HEALTHY' ? { bg: '#10b98115', txt: '#10b981', brd: '#10b98130' }
                                : st === 'WARNING' ? { bg: '#f59e0b15', txt: '#f59e0b', brd: '#f59e0b30' }
                                : { bg: '#ef444415', txt: '#ef4444', brd: '#ef444430' };
                              
                              const total = state.extracted.length || 1;
                              const popPct = (row.populated_count / total) * 100;
                              const nullPct = (row.null_count / total) * 100;

                              return (
                                <tr key={i} className="hover:bg-[var(--bg-tertiary)]/50 transition-colors">
                                  <td className="py-2 px-3 font-semibold text-[var(--text-primary)] whitespace-nowrap">{row.field}</td>
                                  <td className="py-2 px-3 text-[var(--text-secondary)]">{row.is_mandatory ? 'Yes' : 'No'}</td>
                                  <td className="py-2 px-3">
                                    <div className="flex flex-col gap-1 w-full max-w-[120px]">
                                      <div className="flex justify-between text-[9px] text-[var(--text-tertiary)] uppercase tracking-wider">
                                        <span>{row.populated_count} Pop</span>
                                        <span>{row.null_count} Null</span>
                                      </div>
                                      <div className="w-full h-1.5 rounded-full bg-[var(--bg-tertiary)] overflow-hidden flex">
                                        <div className="h-full bg-emerald-500" style={{ width: `${popPct}%` }} />
                                        <div className="h-full bg-red-500" style={{ width: `${nullPct}%` }} />
                                      </div>
                                    </div>
                                  </td>
                                  <td className="py-2 px-3 text-[var(--text-secondary)]">{row.unique_count}</td>
                                  <td className="py-2 px-3">
                                    <div className="flex gap-1 flex-wrap max-w-[150px]">
                                      {row.ws_count > 0 && <span className="bg-amber-500/20 text-amber-600 px-1.5 py-0.5 rounded text-[9px] border border-amber-500/30">Whitespace</span>}
                                      {row.is_mixed_type && <span className="bg-purple-500/20 text-purple-600 px-1.5 py-0.5 rounded text-[9px] border border-purple-500/30">Mixed Type</span>}
                                      {row.is_constant && <span className="bg-blue-500/20 text-blue-600 px-1.5 py-0.5 rounded text-[9px] border border-blue-500/30">Constant</span>}
                                      {row.max_length > 40 && <span className="bg-red-500/20 text-red-600 px-1.5 py-0.5 rounded text-[9px] border border-red-500/30">Len &gt; 40</span>}
                                      {!(row.ws_count > 0 || row.is_mixed_type || row.is_constant || row.max_length > 40) && <span className="text-[var(--text-tertiary)] text-[9px]">—</span>}
                                    </div>
                                  </td>
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

                  {/* Chart 1: Populated vs Null Composed */}
                  {activeTab === 'completeness' && (
                    <div className="space-y-2">
                      <div className="text-[11px] text-[var(--text-secondary)]">Distribution of Populated vs Null records (Use the brush below to zoom/pan)</div>
                      <div style={{ width: '100%', height: 350 }}>
                        <ResponsiveContainer width="100%" height="100%">
                          <ComposedChart
                            data={edaStats}
                            margin={{ top: 20, right: 20, bottom: 20, left: 0 }}
                          >
                            <defs>
                              <linearGradient id="popColor" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#10b981" stopOpacity={0.8}/>
                                <stop offset="95%" stopColor="#10b981" stopOpacity={0.1}/>
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} opacity={0.5} />
                            <XAxis
                              dataKey="field"
                              tick={{ fontSize: 9.5, fill: 'var(--text-tertiary)' }}
                              tickFormatter={(v: string) => v.length > 10 ? v.slice(0, 10) + '…' : v}
                              axisLine={false}
                              tickLine={false}
                              height={60}
                              angle={-45}
                              textAnchor="end"
                            />
                            <YAxis
                              tick={{ fontSize: 10, fill: 'var(--text-tertiary)' }}
                              axisLine={false}
                              tickLine={false}
                              width={40}
                            />
                            <Tooltip
                              contentStyle={{ background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12, boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}
                              labelFormatter={(lbl) => `Field: ${lbl}`}
                            />
                            <Legend wrapperStyle={{ fontSize: 11, paddingTop: 10 }} />
                            <Area type="monotone" dataKey="populated_count" name="Populated" fillOpacity={1} fill="url(#popColor)" stroke="#10b981" />
                            <Line type="monotone" dataKey="null_count" name="Null" stroke="#ef4444" strokeWidth={2} dot={{ r: 3, fill: '#ef4444' }} activeDot={{ r: 6 }} />
                            <Brush dataKey="field" height={25} stroke="var(--border)" fill="var(--bg-tertiary)" tickFormatter={() => ''} startIndex={0} endIndex={Math.min(15, edaStats.length - 1)} />
                          </ComposedChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  )}

                  {/* Chart 2: Cardinality Composed */}
                  {activeTab === 'cardinality' && (
                    <div className="space-y-2">
                      <div className="text-[11px] text-[var(--text-secondary)]">Unique distinct values per field (Constants highlighted in purple)</div>
                      <div style={{ width: '100%', height: 350 }}>
                        <ResponsiveContainer width="100%" height="100%">
                          <ComposedChart
                            data={edaStats}
                            margin={{ top: 20, right: 20, bottom: 20, left: 0 }}
                          >
                            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} opacity={0.5} />
                            <XAxis
                              dataKey="field"
                              tick={{ fontSize: 9.5, fill: 'var(--text-tertiary)' }}
                              tickFormatter={(v: string) => v.length > 10 ? v.slice(0, 10) + '…' : v}
                              axisLine={false}
                              tickLine={false}
                              height={60}
                              angle={-45}
                              textAnchor="end"
                            />
                            <YAxis
                              tick={{ fontSize: 10, fill: 'var(--text-tertiary)' }}
                              axisLine={false}
                              tickLine={false}
                              width={40}
                            />
                            <Tooltip
                              contentStyle={{ background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12, boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}
                              labelFormatter={(lbl) => `Field: ${lbl}`}
                              formatter={(value: any, name: any, props: any) => [
                                value, 
                                props.payload.is_constant ? 'Constant Value' : 'Unique Values'
                              ]}
                            />
                            <Bar dataKey="unique_count" name="Unique Values" radius={[4, 4, 0, 0]} maxBarSize={40}>
                              {edaStats.map((entry: any, index: number) => (
                                <Cell key={`cell-${index}`} fill={entry.is_constant ? '#8b5cf6' : '#06b6d4'} />
                              ))}
                            </Bar>
                            <Brush dataKey="field" height={25} stroke="var(--border)" fill="var(--bg-tertiary)" tickFormatter={() => ''} startIndex={0} endIndex={Math.min(15, edaStats.length - 1)} />
                          </ComposedChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  )}

                  {/* End Tabs */}
                </div>

              </div>

              {/* RIGHT COLUMN: Mandatory Stacked Bar */}
              <div className="w-full lg:w-[320px] flex flex-col gap-4 shrink-0">
                {/* Mandatory Compliance Chart */}
                <div className="bg-[var(--bg-primary)] border border-[var(--border)] rounded-xl p-4 shadow-sm space-y-3">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-primary)]">
                    Mandatory vs Optional Compliance
                  </div>
                  <div style={{ width: '100%', height: 180 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={complianceData}
                        layout="vertical"
                        margin={{ top: 0, right: 10, bottom: 0, left: 0 }}
                        barSize={32}
                      >
                        <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="var(--border)" opacity={0.5} />
                        <XAxis type="number" hide />
                        <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: 'var(--text-primary)', fontWeight: 600 }} axisLine={false} tickLine={false} width={65} />
                        <Tooltip
                          cursor={{ fill: 'var(--bg-secondary)', opacity: 0.2 }}
                          contentStyle={{ background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 11 }}
                        />
                        <Legend wrapperStyle={{ fontSize: 10, paddingTop: 10 }} />
                        <Bar dataKey="Healthy" stackId="a" fill="#10b981" radius={[0, 0, 0, 0]} />
                        <Bar dataKey="Warning" stackId="a" fill="#f59e0b" radius={[0, 0, 0, 0]} />
                        <Bar dataKey="Critical" stackId="a" fill="#ef4444" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="text-[10px] text-[var(--text-tertiary)] text-center">
                    Red indicates critical blockers in mandatory fields.
                  </div>
                </div>
              </div>
            </div>

            {/* BOTTOM FULL-WIDTH: Exec Summary, Risks, Actions */}
            <div className="flex flex-col gap-4 mt-5">
              
              {/* Executive Summary Card */}
              <div className="bg-[var(--bg-primary)] border border-[var(--border)] rounded-xl p-4 shadow-sm">
                <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-[var(--text-primary)] mb-2.5">
                  <ClipboardList className="w-4 h-4 text-indigo-500" /> {aiSummary ? 'AI Executive Summary' : 'Executive Summary'}
                </div>
                <p className="text-[12px] leading-relaxed text-[var(--text-secondary)]">
                  {aiSummary?.summary || reportMetrics.summary}
                </p>
              </div>

              {/* Critical Migration Risks */}
              {(aiSummary?.warnings || reportMetrics.warnings).length > 0 && (
                <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-4 shadow-sm space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-red-500">
                      <ShieldAlert className="w-4 h-4" /> {aiSummary ? 'AI Assessed Risks' : 'Critical Migration Risks'} ({(aiSummary?.warnings || reportMetrics.warnings).length})
                    </div>
                    {(aiSummary?.warnings || reportMetrics.warnings).length > 2 && (
                      <button
                        onClick={() => setShowAllRisks(!showAllRisks)}
                        className="flex items-center gap-1 text-[10.5px] font-semibold text-red-500 hover:text-red-400 transition-colors cursor-pointer bg-red-500/10 px-2.5 py-1 rounded-md"
                      >
                        {showAllRisks ? (
                          <>Show Less <ChevronUp className="w-3.5 h-3.5" /></>
                        ) : (
                          <>Show All <ChevronDown className="w-3.5 h-3.5" /></>
                        )}
                      </button>
                    )}
                  </div>
                  <div className="space-y-2">
                    {(showAllRisks ? (aiSummary?.warnings || reportMetrics.warnings) : (aiSummary?.warnings || reportMetrics.warnings).slice(0, 2)).map((w: string, i: number) => (
                      <div key={i} className="flex gap-2 text-[11.5px] text-red-400 leading-snug bg-red-500/5 p-2.5 rounded-lg border border-red-500/10">
                        <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
                        <span>{w}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Action Plan & Recommended Fixes */}
              {(aiSummary?.recommendations || reportMetrics.recommendations).length > 0 && (
                <div className="bg-[var(--bg-primary)] border border-[var(--border)] rounded-xl p-4 shadow-sm space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-[var(--text-primary)]">
                      <Zap className="w-4 h-4 text-amber-500" /> {aiSummary ? 'AI Strategic Plan' : 'Action Plan'} ({(aiSummary?.recommendations || reportMetrics.recommendations).length})
                    </div>
                    {(aiSummary?.recommendations || reportMetrics.recommendations).length > 2 && (
                      <button
                        onClick={() => setShowAllActions(!showAllActions)}
                        className="flex items-center gap-1 text-[10.5px] font-semibold text-amber-600 dark:text-amber-400 hover:text-amber-500 transition-colors cursor-pointer bg-amber-500/10 px-2.5 py-1 rounded-md"
                      >
                        {showAllActions ? (
                          <>Show Less <ChevronUp className="w-3.5 h-3.5" /></>
                        ) : (
                          <>Show All <ChevronDown className="w-3.5 h-3.5" /></>
                        )}
                      </button>
                    )}
                  </div>
                  <div className="space-y-2">
                    {(showAllActions ? (aiSummary?.recommendations || reportMetrics.recommendations) : (aiSummary?.recommendations || reportMetrics.recommendations).slice(0, 2)).map((r: string, i: number) => (
                      <div key={i} className="p-2.5 rounded-lg bg-[var(--bg-tertiary)]/60 border border-[var(--border)] text-[10.5px] text-[var(--text-secondary)] flex items-start gap-2">
                        <CheckCircle className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                        {r}
                      </div>
                    ))}
                  </div>
                </div>
              )}

            </div>

          </div>

        </div>
      )}
    </PageLayout>
  );
}
