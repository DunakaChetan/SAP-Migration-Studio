import React, { useState, useCallback, type ReactNode, createContext, useContext } from 'react';
import { CheckCircle2, Loader2, Circle, Sparkles } from 'lucide-react';

interface LoadingStep {
  label: string;
  done: boolean;
  result?: string;
}

interface LoadingState {
  visible: boolean;
  title: string;
  sub: string;
  steps: LoadingStep[];
}

const LoadingContext = createContext<{
  showLoad: (title: string, sub: string, steps?: string[]) => void;
  tick: (index: number, msg?: string) => void;
  hideLoad: () => void;
  loading: LoadingState;
} | null>(null);

export function LoadingProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState<LoadingState>({
    visible: false,
    title: '',
    sub: '',
    steps: [],
  });

  const showLoad = useCallback((title: string, sub: string, steps: string[] = []) => {
    setLoading({
      visible: true,
      title,
      sub,
      steps: steps.map((s) => ({ label: s, done: false })),
    });
  }, []);

  const tick = useCallback((index: number, msg?: string) => {
    setLoading((prev) => ({
      ...prev,
      steps: prev.steps.map((s, i) =>
        i === index ? { ...s, done: true, result: msg } : s
      ),
    }));
  }, []);

  const hideLoad = useCallback(() => {
    setLoading((prev) => ({ ...prev, visible: false }));
  }, []);

  const doneCount = loading.steps.filter((s) => s.done).length;
  const totalCount = loading.steps.length;
  const progressPercent = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;

  return (
    <LoadingContext.Provider value={{ showLoad, tick, hideLoad, loading }}>
      {children}
      {loading.visible && (
        <div className="fixed inset-0 z-[9000] flex flex-col items-center justify-center p-4 bg-black/65 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-white dark:bg-[#12141a] border border-[var(--border)] rounded-2xl shadow-2xl p-6 min-w-[340px] max-w-lg w-full flex flex-col items-center gap-5">
            {/* Spinning Indicator with AI badge */}
            <div className="relative flex items-center justify-center">
              <div className="w-12 h-12 rounded-full border-[3px] border-primary-500/20 border-t-primary-500 border-r-teal-400 animate-spin" />
              <div className="absolute inset-0 flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-primary-500 animate-pulse" />
              </div>
            </div>

            {/* Title & Sub */}
            <div className="text-center w-full px-2">
              <div className="text-base font-bold text-[var(--text-primary)] tracking-tight">
                {loading.title}
              </div>
              {loading.sub && (
                <div className="font-mono text-xs text-[var(--text-tertiary)] mt-1.5 break-words">
                  {loading.sub}
                </div>
              )}
            </div>

            {/* Progress Bar & Live Step Updates */}
            {totalCount > 0 && (
              <div className="w-full space-y-3 pt-2 border-t border-[var(--border)]">
                {/* Progress Stats */}
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center text-[11px] font-mono text-[var(--text-secondary)]">
                    <span>Processing Steps</span>
                    <span className="font-bold text-primary-500">
                      {doneCount}/{totalCount} ({progressPercent}%)
                    </span>
                  </div>
                  <div className="h-2 w-full bg-[var(--bg-tertiary)] rounded-full overflow-hidden border border-[var(--border)]">
                    <div
                      className="h-full bg-gradient-to-r from-primary-500 to-teal-400 transition-all duration-300 rounded-full"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                </div>

                {/* Steps Checklist */}
                <div className="flex flex-col gap-1.5 max-h-60 overflow-y-auto pr-1">
                  {loading.steps.map((step, i) => {
                    const isFirstPending = !step.done && loading.steps.slice(0, i).every((s) => s.done);
                    return (
                      <div
                        key={i}
                        className={`flex items-start gap-2.5 font-mono text-[11px] px-3 py-2 rounded-lg transition-all duration-200 border ${
                          step.done
                            ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20'
                            : isFirstPending
                            ? 'bg-primary-500/10 text-primary-700 dark:text-primary-300 border-primary-500/30'
                            : 'text-[var(--text-tertiary)] bg-[var(--bg-tertiary)]/40 border-transparent'
                        }`}
                      >
                        <span className="shrink-0 mt-0.5">
                          {step.done ? (
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                          ) : isFirstPending ? (
                            <Loader2 className="w-3.5 h-3.5 text-primary-500 animate-spin" />
                          ) : (
                            <Circle className="w-3.5 h-3.5 text-gray-400 dark:text-gray-600" />
                          )}
                        </span>
                        <span className="flex-1 break-words">
                          {step.result || step.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </LoadingContext.Provider>
  );
}

export function useLoading() {
  const ctx = useContext(LoadingContext);
  if (!ctx) throw new Error('useLoading must be used within LoadingProvider');
  return ctx;
}
