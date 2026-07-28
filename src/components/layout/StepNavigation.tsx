import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useMigration } from '@/store/migration-store';
import { cn } from '@/lib/utils';
import { Check, Cpu } from 'lucide-react';
import { STEPS } from '@/config/steps';

export function StepNavigation() {
  const { state } = useMigration();
  const location = useLocation();
  const navigate = useNavigate();

  const currentStepIndex = STEPS.findIndex(s => s.path === location.pathname);
  const activeStep = currentStepIndex === -1 ? 0 : currentStepIndex;
  const progress = (activeStep / 8) * 100;

  return (
    <aside className="w-64 h-full hidden lg:flex flex-col bg-[var(--bg-secondary)] border-r border-[var(--border)] relative z-20 shadow-sm">
      {/* Logo Area */}
      <div className="h-16 flex items-center px-6 gap-3 border-b border-[var(--border)]">
        <div className="w-8 h-8 rounded-lg bg-primary-600 flex items-center justify-center shadow-sm">
          <Cpu className="w-4 h-4 text-white" />
        </div>
        <div className="leading-tight">
          <div className="text-sm font-black tracking-tight text-[var(--text-primary)]">
            Migration Studio
          </div>
          <div className="font-mono text-[9px] tracking-wider text-[var(--text-tertiary)] uppercase mt-0.5">
            S/4HANA Edition
          </div>
        </div>
      </div>

      {/* Steps List */}
      <div className="flex-1 overflow-y-auto px-3 py-6 space-y-1.5">
        <div className="text-[10px] font-bold text-[var(--text-tertiary)] uppercase tracking-widest px-3 mb-4">
          Pipeline Steps
        </div>

        {STEPS.map((step, i) => {
          const Icon = step.icon;
          const isActive = activeStep === i;
          const isDone = activeStep > i;

          return (
            <button
              key={i}
              onClick={() => navigate(step.path)}
              className={cn(
                'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors duration-200 group relative',
                isActive && 'text-primary-800 dark:text-primary-300 font-bold',
                isDone && 'text-teal-600 dark:text-teal-400 font-semibold hover:bg-[var(--bg-tertiary)]',
                !isActive && !isDone && 'text-[var(--text-secondary)] font-medium hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]'
              )}
            >
              {isActive && (
                <motion.div
                  layoutId="active-nav-pill"
                  className="apple-glass-pill"
                  transition={{ type: "spring", damping: 18, stiffness: 250, mass: 0.8, bounce: 0.4 }}
                >
                  <div className="absolute left-0 top-1.5 bottom-1.5 w-1.5 bg-primary-600 rounded-r-full shadow-[0_0_8px_rgba(37,99,235,0.6)] z-10" />
                </motion.div>
              )}

              <div
                className={cn(
                  'relative z-10 w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition-colors shadow-sm',
                  isActive ? 'bg-primary-600 text-white' :
                    isDone ? 'bg-teal-50 dark:bg-teal-900/40 text-teal-600 dark:text-teal-400 border border-teal-200 dark:border-teal-800/50' :
                      'bg-[var(--bg-tertiary)] text-[var(--text-tertiary)] border border-[var(--border)] group-hover:text-[var(--text-secondary)]'
                )}
              >
                {isDone ? <Check className="w-3.5 h-3.5" /> : <Icon className="w-3.5 h-3.5" />}
              </div>
              <span className="relative z-10 text-[13px]">{step.label}</span>
            </button>
          );
        })}
      </div>

      {/* Bottom Progress */}
      <div className="p-5 border-t border-[var(--border)] bg-[var(--bg-tertiary)]/30">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] font-bold text-[var(--text-secondary)]">Progress</span>
          <span className="text-[11px] font-mono text-primary-600 dark:text-primary-400 font-bold">{Math.round(progress)}%</span>
        </div>
        <div className="h-1.5 w-full bg-[var(--border)] rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-gradient-to-r from-primary-600 to-teal-500 rounded-full"
            initial={false}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          />
        </div>
      </div>
    </aside>
  );
}
