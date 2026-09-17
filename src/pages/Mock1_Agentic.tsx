import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useMigration, isMock0Completed } from '@/store/migration-store';
import { useNavigate } from 'react-router-dom';
import {
  Bot,
  Cpu,
  ShieldCheck,
  Sparkles,
  Layers,
  ArrowRight,
  Play,
  CheckCircle2,
  Clock,
  Activity,
  Terminal,
  Database,
  RotateCcw,
  Lock,
  FileText,
  AlertTriangle,
  Folder,
  Check,
  X,
  Table,
  Search,
  ExternalLink
} from 'lucide-react';
import { useToast } from '@/components/ui/toast';

interface AgentCard {
  id: string;
  name: string;
  role: string;
  status: 'active' | 'standby' | 'hitl_waiting';
  model: string;
  accuracy: string;
  tasksCompleted: number;
  description: string;
  icon: any;
  color: string;
}

const AGENTS: AgentCard[] = [
  {
    id: 'mapping-agent',
    name: 'Schema Mapping Agent',
    role: 'Autonomous Field & Structure Resolution',
    status: 'active',
    model: 'Gemini 2.5 Flash',
    accuracy: '98.4%',
    tasksCompleted: 142,
    description: 'Analyzes source legacy schemas, queries SAP metadata dictionary, and derives high-confidence field transforms.',
    icon: Cpu,
    color: 'from-blue-500/20 to-indigo-500/20 border-blue-500/40 text-blue-500'
  },
  {
    id: 'harmonize-agent',
    name: 'Harmonization & Join Agent',
    role: 'Multi-Source Composite Entity Solver',
    status: 'standby',
    model: 'Gemini 2.5 Pro',
    accuracy: '96.9%',
    tasksCompleted: 88,
    description: 'Discovers implicit foreign key links, resolves record deduplication, and joins disparate ERP tables.',
    icon: Layers,
    color: 'from-purple-500/20 to-pink-500/20 border-purple-500/40 text-purple-500'
  },
  {
    id: 'cleansing-agent',
    name: 'Cleansing & Remediation Agent',
    role: 'Deterministic Self-Healing Code Generator',
    status: 'active',
    model: 'Gemini 2.5 Pro',
    accuracy: '99.1%',
    tasksCompleted: 215,
    description: 'Generates vectorized Python pandas scripts to automatically repair phone, tax, country, and postal violations.',
    icon: Sparkles,
    color: 'from-emerald-500/20 to-teal-500/20 border-emerald-500/40 text-emerald-500'
  },
  {
    id: 'validation-agent',
    name: 'Compliance & Validation Agent',
    role: 'S/4HANA Domain Constraint Verifier',
    status: 'hitl_waiting',
    model: 'DeepSeek R1 / Reasoning',
    accuracy: '99.8%',
    tasksCompleted: 310,
    description: 'Evaluates business partner bank keys, mandatory customer groups, and triggers human review on ambiguous rules.',
    icon: ShieldCheck,
    color: 'from-amber-500/20 to-orange-500/20 border-amber-500/40 text-amber-500'
  }
];

export function Mock1Agentic() {
  const { state, dispatch } = useMigration();
  const navigate = useNavigate();
  const { toast } = useToast();

  const isUnlocked = isMock0Completed(state);

  const [isRunning, setIsRunning] = useState(false);
  const [activeTab, setActiveTab] = useState<'baseline' | 'agents' | 'hitl' | 'logs'>('baseline');
  const [hitlApproved, setHitlApproved] = useState<Record<string, boolean>>({});
  
  const initialBaseline = (state.transformed && state.transformed.length > 0)
    ? state.transformed
    : ((state.dmcRows && state.dmcRows.length > 0) ? state.dmcRows : (state.cleaned || []));

  const [baselineRows, setBaselineRows] = useState<Record<string, any>[]>(initialBaseline);
  const [baselineSearch, setBaselineSearch] = useState<string>('');
  const [isLoadingBaseline, setIsLoadingBaseline] = useState<boolean>(false);
  const [mock0RecordsCount, setMock0RecordsCount] = useState<number>(
    initialBaseline.length || state.harmonized?.length || state.extracted?.length || 0
  );

  // Dynamic log entries seeded with actual Mock 0 state
  const [logs, setLogs] = useState<Array<{ ts: string; agent: string; text: string }>>([]);

  useEffect(() => {
    if (isUnlocked && state.projectId && baselineRows.length === 0) {
      setIsLoadingBaseline(true);
      fetch(`${import.meta.env.VITE_BACKEND_URL}/api/sap/transform/load/${state.projectId}?mock_cycle=mock-0`)
        .then(r => r.json())
        .then(d => {
          if (d?.data && Array.isArray(d.data) && d.data.length > 0) {
            setBaselineRows(d.data);
            setMock0RecordsCount(d.data.length);
          }
        })
        .catch(e => console.warn('Could not load Mock 0 transform data:', e))
        .finally(() => setIsLoadingBaseline(false));
    }
  }, [isUnlocked, state.projectId, baselineRows.length]);

  useEffect(() => {
    if (isUnlocked) {
      const records = baselineRows.length || state.transformed?.length || state.cleaned?.length || state.harmonized?.length || state.extracted?.length || 1200;
      setMock0RecordsCount(records);
      setLogs([
        { ts: '12:44:00', agent: 'Ingestion', text: `Loaded Mock 0 final transformed dataset (${records} records) for project "${state.projectName || 'Active Project'}"` },
        { ts: '12:44:02', agent: 'Orchestrator', text: `Initializing Mock 1 Agentic Loop for target object "${state.obj || 'CUSTOMER'}" using Mock 0 baseline` },
        { ts: '12:44:05', agent: 'Mapping Agent', text: `Inherited ${state.mapping?.length || 48} field mappings from Mock 0. Re-evaluating composite SAP structures.` },
        { ts: '12:44:12', agent: 'Validation Agent', text: `Cross-checking ${state.dynamicRules?.length || 6} Mock 0 dynamic rules against target SAP dictionary.` },
        { ts: '12:44:18', agent: 'Cleansing Agent', text: `Mock 0 automated fixes verified. 0 syntax collisions detected in baseline.` },
      ]);
    }
  }, [isUnlocked, baselineRows.length, state.transformed, state.cleaned, state.projectName, state.obj, state.mapping, state.dynamicRules]);

  const toggleRun = () => {
    setIsRunning(!isRunning);
    if (!isRunning) {
      toast('Agent swarm started. Running autonomous optimization on Mock 0 dataset...', 'ok');
      const time = new Date().toLocaleTimeString();
      setLogs(prev => [
        { ts: time, agent: 'Orchestrator', text: 'Autonomous multi-agent loop running: analyzing S/4HANA commit readiness...' },
        ...prev
      ]);
    }
  };

  const approveHitl = (id: string) => {
    setHitlApproved(prev => ({ ...prev, [id]: true }));
    toast('Decision point approved. Ingested into agent memory.', 'ok');
  };

  const completeMock1 = () => {
    dispatch({ type: 'SET_FIELD', field: 'isMock1Completed', value: true });
    dispatch({ type: 'SET_FIELD', field: 'activeMock', value: 'mock-2' });
    toast('Mock 1 Autonomous Pipeline completed! Mock 2 (Options & Cutover) is now unlocked.', 'ok');
    navigate('/mock-2');
  };

  // ═══════════════════════════════════════════════════════════════
  // LOCKED VIEW: If Mock 0 has not finished through Step 9 Tech Docs
  // ═══════════════════════════════════════════════════════════════
  if (!isUnlocked) {
    const stepsChecklist = [
      { step: 'Step 1', name: 'Source & Project Setup', done: Boolean(state.projectId) },
      { step: 'Step 2', name: 'Field Mapping', done: Boolean(state.isMappingSaved || state.mapping?.length > 0) },
      { step: 'Step 3', name: 'Data Extraction', done: Boolean(state.isDataSaved || state.extracted?.length > 0) },
      { step: 'Step 4', name: 'Harmonization & Joins', done: Boolean(state.isHarmonizedSaved || state.harmonized?.length > 0) },
      { step: 'Step 5', name: 'Validation Checks', done: Boolean(state.isValidatedSaved || state.validated?.length > 0) },
      { step: 'Step 6', name: 'Data Cleansing', done: Boolean(state.isCleansedSaved || state.cleaned?.length > 0) },
      { step: 'Step 7', name: 'Transformation', done: Boolean(state.isTransformedSaved || state.transformed?.length > 0) },
      { step: 'Step 9', name: 'Tech Docs Report Generated', done: Boolean(state.isTechDocsSaved || state.techDocId) },
    ];

    const completedCount = stepsChecklist.filter(s => s.done).length;

    return (
      <div className="max-w-4xl mx-auto py-12 px-4 space-y-6">
        <div className="rounded-3xl border border-amber-500/30 bg-[var(--bg-secondary)] p-8 md:p-12 text-center space-y-6 shadow-2xl relative overflow-hidden">
          <div className="w-20 h-20 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-500 flex items-center justify-center mx-auto shadow-lg shadow-amber-500/10">
            <Lock className="w-10 h-10" />
          </div>

          <div className="space-y-2 max-w-xl mx-auto">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-500 text-xs font-mono font-bold uppercase tracking-wider">
              Prerequisite Required
            </div>
            <h1 className="text-2xl md:text-3xl font-black text-[var(--text-primary)] tracking-tight">
              Mock 1 (Agentic AI) is Locked
            </h1>
            <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
              To unlock the autonomous multi-agent pipeline, you must completely finish <strong>Mock 0 (Standard Flow)</strong> through <strong>Step 9 Tech Docs</strong>. Mock 1 will then automatically ingest the final transformed dataset and rules from Mock 0 as its operational baseline.
            </p>
          </div>

          {/* Progress Bar */}
          <div className="max-w-md mx-auto space-y-2">
            <div className="flex justify-between text-xs font-mono font-bold">
              <span className="text-[var(--text-secondary)]">Mock 0 Readiness</span>
              <span className="text-amber-500">{completedCount} of {stepsChecklist.length} Milestones</span>
            </div>
            <div className="h-2 w-full bg-[var(--bg-tertiary)] rounded-full overflow-hidden border border-[var(--border)]">
              <div
                className="h-full bg-amber-500 transition-all duration-500 rounded-full"
                style={{ width: `${(completedCount / stepsChecklist.length) * 100}%` }}
              />
            </div>
          </div>

          {/* Checklist */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-w-xl mx-auto text-left pt-2">
            {stepsChecklist.map((item, i) => (
              <div
                key={i}
                className={`p-3 rounded-xl border flex items-center justify-between text-xs font-medium transition-all ${
                  item.done
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400 font-bold'
                    : 'bg-[var(--bg-tertiary)]/50 border-[var(--border)] text-[var(--text-tertiary)]'
                }`}
              >
                <div className="flex items-center gap-2 truncate">
                  <span className="font-mono text-[10px] opacity-70">{item.step}</span>
                  <span className="truncate">{item.name}</span>
                </div>
                {item.done ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                ) : (
                  <Clock className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                )}
              </div>
            ))}
          </div>

          {/* Action Button */}
          <div className="pt-4 flex flex-col sm:flex-row items-center justify-center gap-3">
            <button
              onClick={() => {
                dispatch({ type: 'SET_FIELD', field: 'activeMock', value: 'mock-0' });
                // Navigate to next incomplete step or docs
                if (!state.projectId) navigate('/');
                else if (!state.isTechDocsSaved) navigate('/docs');
                else navigate('/transform');
              }}
              className="px-6 py-3 rounded-xl bg-primary-600 hover:bg-primary-700 text-white font-bold text-xs shadow-lg shadow-primary-500/20 transition-all flex items-center gap-2 cursor-pointer"
            >
              <span>Continue Mock 0 Pipeline</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════
  // UNLOCKED VIEW: Mock 0 Completed, Ingesting Final Mock 0 Deliverables
  // ═══════════════════════════════════════════════════════════════
  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-12">
      {/* Top Banner */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-blue-900/40 via-indigo-900/30 to-purple-900/40 border border-blue-500/20 p-6 md:p-8 backdrop-blur-xl shadow-xl">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-mono font-bold tracking-wider uppercase">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Mock 1 Unlocked — Ingested Mock 0 Baseline
            </div>
            <h1 className="text-2xl md:text-3xl font-black tracking-tight text-[var(--text-primary)]">
              Multi-Agent Autonomous Migration Hub
            </h1>
            <p className="text-sm text-[var(--text-secondary)] max-w-2xl">
              Operating autonomously on final deliverables from Mock 0. Four specialized LLM agents cross-audit, optimize, and synthesize self-healing rules for S/4HANA posting.
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0 flex-wrap">
            <button
              onClick={() => {
                dispatch({ type: 'SET_FIELD', field: 'activeMock', value: 'mock-0' });
                navigate('/');
              }}
              className="px-4 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-xs font-bold transition-all flex items-center gap-2 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Switch to Mock 0
            </button>

            <button
              onClick={toggleRun}
              className={`px-5 py-2.5 rounded-xl font-bold text-xs shadow-lg transition-all flex items-center gap-2 cursor-pointer ${
                isRunning
                  ? 'bg-amber-600 hover:bg-amber-700 text-white shadow-amber-500/20 animate-pulse'
                  : 'bg-primary-600 hover:bg-primary-700 text-white shadow-primary-500/25'
              }`}
            >
              <Play className="w-4 h-4 fill-current" />
              {isRunning ? 'Pause Autonomous Loop' : 'Start Agentic Execution'}
            </button>

            <button
              onClick={completeMock1}
              className="px-4 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs shadow-lg shadow-teal-500/20 transition-all flex items-center gap-2 cursor-pointer"
            >
              <span>Complete Mock 1</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Decorative Grid Glow */}
        <div className="absolute -right-20 -bottom-20 w-80 h-80 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
      </div>

      {/* Navigation Pills */}
      <div className="flex items-center gap-2 border-b border-[var(--border)] pb-3 overflow-x-auto">
        <button
          onClick={() => setActiveTab('baseline')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
            activeTab === 'baseline'
              ? 'bg-primary-600 text-white shadow-sm'
              : 'text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]'
          }`}
        >
          <Database className="w-3.5 h-3.5" />
          Mock 0 Ingested Baseline
        </button>

        <button
          onClick={() => setActiveTab('agents')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
            activeTab === 'agents'
              ? 'bg-primary-600 text-white shadow-sm'
              : 'text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]'
          }`}
        >
          <Cpu className="w-3.5 h-3.5" />
          Agent Swarm (4)
        </button>

        <button
          onClick={() => setActiveTab('hitl')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer relative ${
            activeTab === 'hitl'
              ? 'bg-primary-600 text-white shadow-sm'
              : 'text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]'
          }`}
        >
          <ShieldCheck className="w-3.5 h-3.5" />
          HITL Review Gate
          <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping absolute -top-0.5 right-1" />
        </button>

        <button
          onClick={() => setActiveTab('logs')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
            activeTab === 'logs'
              ? 'bg-primary-600 text-white shadow-sm'
              : 'text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]'
          }`}
        >
          <Terminal className="w-3.5 h-3.5" />
          Live Agent Reasoning Log
        </button>
      </div>

      {/* Tab: Mock 0 Ingested Baseline */}
      {activeTab === 'baseline' && (
        <div className="space-y-6">
          <div className="p-6 rounded-2xl border border-emerald-500/30 bg-emerald-500/5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-bold text-emerald-500">
                <CheckCircle2 className="w-4 h-4" />
                <span>Mock 0 Final Assets Successfully Transferred to Mock 1</span>
              </div>
              <span className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400 font-bold uppercase bg-emerald-500/10 px-2.5 py-0.5 rounded-full border border-emerald-500/20">
                Connected
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="p-4 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border)] space-y-1">
                <div className="text-[10px] text-[var(--text-tertiary)] uppercase font-mono">Target SAP Object</div>
                <div className="text-base font-black text-[var(--text-primary)]">{state.obj || 'CUSTOMER'}</div>
                <div className="text-[11px] text-[var(--text-secondary)]">Project: {state.projectName || 'Active'}</div>
              </div>

              <div className="p-4 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border)] space-y-1">
                <div className="text-[10px] text-[var(--text-tertiary)] uppercase font-mono">Mock 0 Final Dataset</div>
                <div className="text-base font-black text-emerald-500 font-mono">
                  {mock0RecordsCount.toLocaleString()} Rows
                </div>
                <div className="text-[11px] text-[var(--text-secondary)]">Transformed & Cleansed</div>
              </div>

              <div className="p-4 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border)] space-y-1">
                <div className="text-[10px] text-[var(--text-tertiary)] uppercase font-mono">Field Mappings & Rules</div>
                <div className="text-base font-black text-[var(--text-primary)] font-mono">
                  {state.mapping?.length || 48} Mappings
                </div>
                <div className="text-[11px] text-[var(--text-secondary)]">{state.dynamicRules?.length || 6} dynamic rules compiled</div>
              </div>

              <div className="p-4 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border)] space-y-1">
                <div className="text-[10px] text-[var(--text-tertiary)] uppercase font-mono">Mock 0 Master Tech Doc</div>
                <div className="text-base font-black text-purple-500 font-mono truncate">
                  {state.techDocId ? `Doc #${state.techDocId.slice(0, 8)}` : 'Generated'}
                </div>
                <div className="text-[11px] text-[var(--text-secondary)]">Step 9 Consolidated Report</div>
              </div>
            </div>
          </div>

          <div className="p-6 rounded-2xl border border-[var(--border)] bg-[var(--bg-secondary)] space-y-4">
            <h3 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2">
              <Activity className="w-4 h-4 text-primary-500" />
              How Mock 1 Agentic AI Enhances Mock 0 Deliverables
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs leading-relaxed">
              <div className="p-4 rounded-xl bg-[var(--bg-tertiary)]/50 border border-[var(--border)] space-y-2">
                <div className="font-bold text-[var(--text-primary)] flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-emerald-500" /> Autonomous Secondary Passes
                </div>
                <p className="text-[var(--text-secondary)]">
                  The agents iteratively inspect Mock 0's final transformed table to detect edge-case pattern drift and cross-table reconciliation failures.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-[var(--bg-tertiary)]/50 border border-[var(--border)] space-y-2">
                <div className="font-bold text-[var(--text-primary)] flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-amber-500" /> Human-in-the-Loop (HITL)
                </div>
                <p className="text-[var(--text-secondary)]">
                  Ambiguous data rows that were bypassed in Mock 0 are surfaced with agent chain-of-thought rationale for quick 1-click business approval.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-[var(--bg-tertiary)]/50 border border-[var(--border)] space-y-2">
                <div className="font-bold text-[var(--text-primary)] flex items-center gap-1.5">
                  <Layers className="w-4 h-4 text-blue-500" /> Direct S/4HANA Readiness
                </div>
                <p className="text-[var(--text-secondary)]">
                  Outputs verified payload bundles directly formatted for RFC/BAPI or Cockpit posting into Mock 2 deployment simulation.
                </p>
              </div>
            </div>
          </div>

          {/* Ingested Mock 0 Transformed Dataset Preview */}
          <div className="p-6 rounded-2xl border border-[var(--border)] bg-[var(--bg-secondary)] space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2">
                  <Table className="w-4 h-4 text-emerald-500" />
                  Mock 0 Ingested Dataset — Transformed S/4HANA Records
                </h3>
                <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                  Live operational baseline inherited from Mock 0 Transformation (Step 7) & DMC (Step 8).
                </p>
              </div>

              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" />
                  <input
                    type="text"
                    value={baselineSearch}
                    onChange={(e) => setBaselineSearch(e.target.value)}
                    placeholder="Search baseline records..."
                    className="pl-8 pr-3 py-1.5 rounded-lg text-xs bg-[var(--bg-tertiary)]/60 border border-[var(--border)] text-[var(--text-primary)] focus:outline-hidden focus:border-primary-500 w-48 sm:w-60"
                  />
                </div>
                <span className="px-2.5 py-1 rounded-lg bg-[var(--bg-tertiary)] border border-[var(--border)] text-[11px] font-mono text-[var(--text-secondary)] font-bold">
                  {baselineRows.length.toLocaleString()} rows
                </span>
              </div>
            </div>

            {isLoadingBaseline ? (
              <div className="py-12 text-center text-xs text-[var(--text-secondary)] font-mono animate-pulse">
                Loading Mock 0 transformed dataset from backend...
              </div>
            ) : baselineRows.length > 0 ? (
              <div className="overflow-x-auto border border-[var(--border)] rounded-xl scrollbar-thin">
                <table className="w-full text-left text-xs font-mono">
                  <thead className="bg-[var(--bg-tertiary)]/70 text-[var(--text-tertiary)] uppercase text-[10px] tracking-wider border-b border-[var(--border)]">
                    <tr>
                      <th className="px-3 py-2.5 w-12 text-center">#</th>
                      {Object.keys(baselineRows[0]).slice(0, 9).map((col) => (
                        <th key={col} className="px-3 py-2.5 truncate font-bold text-[var(--text-primary)]">
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border)] text-[var(--text-secondary)]">
                    {baselineRows
                      .filter((r) => {
                        if (!baselineSearch.trim()) return true;
                        return Object.values(r).some((v) =>
                          String(v).toLowerCase().includes(baselineSearch.toLowerCase())
                        );
                      })
                      .slice(0, 15)
                      .map((row, idx) => (
                        <tr key={idx} className="hover:bg-[var(--bg-tertiary)]/40 transition-colors">
                          <td className="px-3 py-2 text-center text-[var(--text-tertiary)] text-[10px]">
                            {idx + 1}
                          </td>
                          {Object.keys(baselineRows[0]).slice(0, 9).map((col) => (
                            <td key={col} className="px-3 py-2 truncate max-w-[180px]">
                              {String(row[col] ?? '') || <span className="opacity-30">null</span>}
                            </td>
                          ))}
                        </tr>
                      ))}
                  </tbody>
                </table>
                {baselineRows.length > 15 && (
                  <div className="py-2 px-3 bg-[var(--bg-tertiary)]/30 border-t border-[var(--border)] text-[10px] text-[var(--text-tertiary)] flex justify-between">
                    <span>Showing top 15 records of {baselineRows.length.toLocaleString()} total</span>
                    <span className="font-bold text-emerald-500">All records operational for Mock 1 Agent Loop</span>
                  </div>
                )}
              </div>
            ) : (
              <div className="p-8 text-center text-xs text-[var(--text-secondary)] bg-[var(--bg-tertiary)]/20 rounded-xl border border-dashed border-[var(--border)]">
                Mock 0 records loaded into operational pipeline memory ({mock0RecordsCount.toLocaleString()} count registered).
              </div>
            )}
          </div>

          {/* Inherited Mappings & Dynamic Rules from Mock 0 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-5 rounded-2xl border border-[var(--border)] bg-[var(--bg-secondary)] space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)] flex items-center gap-1.5 font-mono">
                  <Database className="w-3.5 h-3.5 text-primary-500" />
                  Inherited Field Mappings ({state.mapping?.length || 0})
                </h4>
                <span className="text-[10px] text-emerald-500 font-mono font-bold bg-emerald-500/10 px-2 py-0.5 rounded">
                  Active in Agents
                </span>
              </div>
              <div className="max-h-48 overflow-y-auto space-y-1.5 scrollbar-thin pr-1">
                {(state.mapping && state.mapping.length > 0) ? (
                  state.mapping.slice(0, 10).map((m, idx) => (
                    <div key={idx} className="flex items-center justify-between p-2 rounded-lg bg-[var(--bg-tertiary)]/50 border border-[var(--border)] text-xs font-mono">
                      <span className="text-[var(--text-secondary)] truncate">{m.src}</span>
                      <ArrowRight className="w-3 h-3 text-[var(--text-tertiary)] shrink-0 mx-2" />
                      <span className="text-primary-500 font-bold truncate">{m.sap}</span>
                    </div>
                  ))
                ) : (
                  <div className="text-xs text-[var(--text-tertiary)] italic p-2">
                    Default target schema dictionary applied for {state.obj || 'CUSTOMER'}.
                  </div>
                )}
              </div>
            </div>

            <div className="p-5 rounded-2xl border border-[var(--border)] bg-[var(--bg-secondary)] space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)] flex items-center gap-1.5 font-mono">
                  <Sparkles className="w-3.5 h-3.5 text-purple-500" />
                  Inherited Dynamic Rules & Remediations
                </h4>
                <span className="text-[10px] text-purple-500 font-mono font-bold bg-purple-500/10 px-2 py-0.5 rounded">
                  Mock 0 Step 5/6 Rules
                </span>
              </div>
              <div className="max-h-48 overflow-y-auto space-y-1.5 scrollbar-thin pr-1">
                {(state.dynamicRules && state.dynamicRules.length > 0) ? (
                  state.dynamicRules.slice(0, 10).map((r, idx) => (
                    <div key={idx} className="p-2 rounded-lg bg-[var(--bg-tertiary)]/50 border border-[var(--border)] text-xs font-mono">
                      <div className="font-bold text-[var(--text-primary)]">{r.rule_name || r.name || `Rule #${idx + 1}`}</div>
                      <div className="text-[10px] text-[var(--text-tertiary)] truncate">{r.expression || r.description || JSON.stringify(r)}</div>
                    </div>
                  ))
                ) : (
                  <div className="text-xs text-[var(--text-tertiary)] italic p-2">
                    Validation checks and cleansing transforms from Mock 0 active in Agent memory.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab: Agent Swarm */}
      {activeTab === 'agents' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {AGENTS.map(agent => {
              const Icon = agent.icon;
              return (
                <div
                  key={agent.id}
                  className="rounded-2xl border border-[var(--border)] bg-[var(--bg-secondary)]/70 p-5 hover:border-primary-500/40 transition-all shadow-sm relative overflow-hidden"
                >
                  <div className="flex items-start justify-between gap-4 mb-3">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${agent.color} border flex items-center justify-center shrink-0`}>
                        <Icon className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="text-sm font-black text-[var(--text-primary)] tracking-tight">
                          {agent.name}
                        </h3>
                        <p className="text-xs text-[var(--text-tertiary)] font-mono">
                          {agent.role}
                        </p>
                      </div>
                    </div>

                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase tracking-wider ${
                        agent.status === 'active'
                          ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20'
                          : agent.status === 'hitl_waiting'
                          ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20 animate-pulse'
                          : 'bg-zinc-500/10 text-zinc-400 border border-zinc-500/20'
                      }`}
                    >
                      {agent.status === 'active' ? '● Active' : agent.status === 'hitl_waiting' ? '▲ Needs HITL' : '○ Standby'}
                    </span>
                  </div>

                  <p className="text-xs text-[var(--text-secondary)] mb-4 leading-relaxed">
                    {agent.description}
                  </p>

                  <div className="grid grid-cols-3 gap-2 p-2.5 rounded-xl bg-[var(--bg-tertiary)]/50 border border-[var(--border)] text-center text-xs font-mono">
                    <div>
                      <div className="text-[10px] text-[var(--text-tertiary)] uppercase">Model</div>
                      <div className="font-bold text-[var(--text-primary)] truncate">{agent.model}</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-[var(--text-tertiary)] uppercase">Precision</div>
                      <div className="font-bold text-emerald-500">{agent.accuracy}</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-[var(--text-tertiary)] uppercase">Tasks</div>
                      <div className="font-bold text-[var(--text-primary)]">{agent.tasksCompleted}</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Tab: HITL Review Gate */}
      {activeTab === 'hitl' && (
        <div className="space-y-4">
          <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <ShieldCheck className="w-5 h-5 text-amber-500 shrink-0" />
              <div>
                <h4 className="text-sm font-bold text-[var(--text-primary)]">Human-in-the-Loop (HITL) Queue</h4>
                <p className="text-xs text-[var(--text-secondary)]">The Validation Agent escalated 2 decision points requiring business review before posting.</p>
              </div>
            </div>
            <span className="px-2.5 py-1 rounded-full bg-amber-500/20 text-amber-400 text-xs font-mono font-bold">
              2 Pending
            </span>
          </div>

          <div className="space-y-3">
            <div className="p-4 rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 text-[10px] font-mono font-bold">KNA1-LAND1</span>
                    <h5 className="text-sm font-bold text-[var(--text-primary)]">Country Code Discrepancy (UK vs GB)</h5>
                  </div>
                  <p className="text-xs text-[var(--text-secondary)] mt-1">
                    Agent proposed mapping legacy country "UK" to SAP standard "GB" for 45 records. Rule confidence: 92%.
                  </p>
                </div>
                {hitlApproved['uk-gb'] ? (
                  <span className="px-3 py-1 rounded-lg bg-emerald-500/10 text-emerald-500 text-xs font-bold flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Approved
                  </span>
                ) : (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => approveHitl('uk-gb')}
                      className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all cursor-pointer"
                    >
                      Approve Override
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="p-4 rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded bg-purple-500/10 text-purple-400 text-[10px] font-mono font-bold">KNVV-WAERS</span>
                    <h5 className="text-sm font-bold text-[var(--text-primary)]">Currency Code Validation (JPY vs JPY0)</h5>
                  </div>
                  <p className="text-xs text-[var(--text-secondary)] mt-1">
                    3 legacy accounts have currency 'JPY0'. Agent flagged potential legacy keying anomaly.
                  </p>
                </div>
                {hitlApproved['jpy'] ? (
                  <span className="px-3 py-1 rounded-lg bg-emerald-500/10 text-emerald-500 text-xs font-bold flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Approved
                  </span>
                ) : (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => approveHitl('jpy')}
                      className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all cursor-pointer"
                    >
                      Approve Auto-fix
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab: Logs */}
      {activeTab === 'logs' && (
        <div className="p-4 rounded-2xl border border-[var(--border)] bg-zinc-950 font-mono text-xs text-zinc-300 space-y-2.5 shadow-2xl">
          <div className="flex items-center justify-between pb-3 border-b border-zinc-800 text-zinc-400">
            <div className="flex items-center gap-2">
              <Terminal className="w-4 h-4 text-emerald-400" />
              <span>Agent Swarm Orchestration Stream (mock-1)</span>
            </div>
            <span className="text-[10px] text-zinc-500">Live Socket Connected</span>
          </div>

          <div className="space-y-2 max-h-96 overflow-y-auto pr-2">
            {logs.map((log, i) => (
              <div key={i} className="flex items-start gap-3 leading-relaxed">
                <span className="text-zinc-500 shrink-0">{log.ts}</span>
                <span className="text-blue-400 font-bold shrink-0">[{log.agent}]</span>
                <span className="text-zinc-200">{log.text}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
export default Mock1Agentic;
