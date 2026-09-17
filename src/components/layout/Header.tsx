import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useMigration } from '@/store/migration-store';
import { Sun, Moon, Settings, Bell, Search, Menu, ChevronRight, Folder, Database, Layers, Sliders, Lock } from 'lucide-react';
import { MOCK_CONFIGS } from '@/config/steps';
import { isMock0Completed, isMock1Completed } from '@/store/migration-store';
import { useToast } from '@/components/ui/toast';

export function Header() {
  const { state, dispatch } = useMigration();
  const location = useLocation();
  const navigate = useNavigate();
  const { toast } = useToast();

  const toggleTheme = () => {
    const next = state.theme === 'light' ? 'dark' : 'light';
    dispatch({ type: 'SET_THEME', theme: next });
    document.documentElement.classList.toggle('dark', next === 'dark');
  };

  const isMock1Unlocked = isMock0Completed(state);
  const isMock2Unlocked = isMock1Completed(state);

  const activeMock = state.activeMock || 'mock-0';
  const currentMockConfig = MOCK_CONFIGS[activeMock] || MOCK_CONFIGS['mock-0'];
  const currentStepObj = currentMockConfig.steps.find(
    s => s.path === location.pathname || (s.path !== '/' && location.pathname.startsWith(s.path))
  ) || currentMockConfig.steps[0];
  const currentStepLabel = currentStepObj.label;

  const handleCycleMock = () => {
    if (activeMock === 'mock-0') {
      if (isMock1Unlocked) {
        dispatch({ type: 'SET_FIELD', field: 'activeMock', value: 'mock-1' });
      } else {
        toast('Mock 1 is locked. Complete all Mock 0 steps including Step 9 Tech Docs first.', 'warn');
      }
    } else if (activeMock === 'mock-1') {
      if (isMock2Unlocked) {
        dispatch({ type: 'SET_FIELD', field: 'activeMock', value: 'mock-2' });
      } else {
        dispatch({ type: 'SET_FIELD', field: 'activeMock', value: 'mock-0' });
      }
    } else {
      dispatch({ type: 'SET_FIELD', field: 'activeMock', value: 'mock-0' });
    }
  };

  return (
    <header className="shrink-0 relative z-50 h-16 flex items-center px-6 gap-4 border-b border-[var(--border)]/40 bg-[var(--bg-primary)]/80 backdrop-blur-md">
      {/* Breadcrumb / Title */}
      <div className="flex items-center gap-3">
        <button className="lg:hidden w-8 h-8 flex items-center justify-center rounded-lg text-[var(--text-tertiary)] hover:bg-[var(--bg-tertiary)] transition-colors">
          <Menu className="w-5 h-5" />
        </button>
        <div className="flex flex-col gap-0.5">
          {/* Highlighted Breadcrumb Pill Navigation */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {/* Project Pill */}
            <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-500/10 dark:bg-blue-500/15 border border-blue-500/25 text-blue-600 dark:text-blue-400 text-[10px] font-mono font-bold tracking-wide shadow-xs">
              <Folder className="w-3 h-3 text-blue-500" />
              <span>{state.projectName || 'NO PROJECT'}</span>
            </div>

            <ChevronRight className="w-3 h-3 text-[var(--text-tertiary)] shrink-0 opacity-60" />

            {/* Object Pill */}
            <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/10 dark:bg-emerald-500/15 border border-emerald-500/25 text-emerald-600 dark:text-emerald-400 text-[10px] font-mono font-bold tracking-wide shadow-xs">
              <Database className="w-3 h-3 text-emerald-500" />
              <span>{state.obj || 'CUSTOMER'}</span>
            </div>

            <ChevronRight className="w-3 h-3 text-[var(--text-tertiary)] shrink-0 opacity-60" />

            {/* Mock Cycle Pill */}
            <div
              onClick={handleCycleMock}
              title="Click to switch Mock environment"
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/10 dark:bg-amber-500/15 border border-amber-500/25 text-amber-600 dark:text-amber-400 text-[10px] font-mono font-bold tracking-wide shadow-xs cursor-pointer hover:bg-amber-500/20 transition-all"
            >
              <Sliders className="w-3 h-3 text-amber-500" />
              <span>{currentMockConfig.name.toUpperCase()} ({currentMockConfig.subtitle.toUpperCase()})</span>
            </div>

            <ChevronRight className="w-3 h-3 text-[var(--text-tertiary)] shrink-0 opacity-60" />

            {/* Step Pill */}
            <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-purple-500/10 dark:bg-purple-500/15 border border-purple-500/25 text-purple-600 dark:text-purple-400 text-[10px] font-mono font-bold tracking-wide shadow-xs">
              <Layers className="w-3 h-3 text-purple-500" />
              <span>{currentStepLabel}</span>
            </div>
          </div>

          <span className="text-base font-bold text-[var(--text-primary)] tracking-tight">
            {currentStepLabel}
          </span>
        </div>
      </div>

      <div className="flex-1" />

      {/* Right Actions */}
      <div className="flex items-center gap-2">
        <div className="hidden sm:flex items-center bg-[var(--bg-secondary)] border border-[var(--border)] rounded-full px-3 py-1.5 shadow-sm mr-2">
          <Search className="w-3.5 h-3.5 text-[var(--text-tertiary)] mr-2" />
          <input type="text" placeholder="Search resources..." className="bg-transparent border-none outline-none text-[12px] text-[var(--text-primary)] w-40 placeholder-[var(--text-tertiary)]" />
        </div>

        <button className="w-9 h-9 flex items-center justify-center rounded-full bg-[var(--bg-secondary)] border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] shadow-sm transition-all" title="Notifications">
          <Bell className="w-4 h-4" />
        </button>

        <button className="w-9 h-9 flex items-center justify-center rounded-full bg-[var(--bg-secondary)] border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] shadow-sm transition-all" title="Settings">
          <Settings className="w-4 h-4" />
        </button>

        <button onClick={toggleTheme} className="w-9 h-9 flex items-center justify-center rounded-full bg-[var(--bg-secondary)] border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] shadow-sm transition-all" title="Toggle theme">
          {state.theme === 'light' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
        </button>

        <button
          onClick={() => navigate('/wrapper')}
          className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-[12px] font-bold shadow-sm ml-2 cursor-pointer transition-all ${
            location.pathname === '/wrapper'
              ? 'bg-emerald-600 ring-2 ring-emerald-400 ring-offset-2 ring-offset-[var(--bg-primary)]'
              : 'bg-primary-600 hover:bg-primary-700'
          }`}
          title="Open Master Live Wrapper Dashboard"
        >
          DC
        </button>
      </div>
    </header>
  );
}
