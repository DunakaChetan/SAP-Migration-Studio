import React, { useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMigration } from '@/store/migration-store';
import { useToast } from '@/components/ui/toast';
import { useLoading } from '@/components/ui/loading-overlay';
import { dl, expCSV } from '@/lib/utils';
import { PageLayout, PageGrid, GridCol, Card, CardHeader, CardBody, Button, StatBox, StatsGrid, DataTable, InfoBox, EmptyState, AIResponse } from '@/components/shared';
import { ArrowLeft, ArrowRight, Sparkles, Download, Bot, Upload, Save } from 'lucide-react';

type Source = 'harmonized' | 'upload';

interface CleanserSummary {
  rows_loaded?: number;
  rows_exported?: number;
  rows_modified_count?: number;
  validation_fixes?: { count?: number; items?: any[] };
  cleanser_fixes?: { count?: number; items?: any[] };
  warnings?: string[];
  rules_applied?: string[];
}

export function Step6Cleanse() {
  const { state, dispatch } = useMigration();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { showLoad, tick, hideLoad } = useLoading();
  
  const [source, setSource] = React.useState<Source>('harmonized');
  const [standaloneCsv, setStandaloneCsv] = React.useState<File | null>(null);
  const [standaloneValidationJson, setStandaloneValidationJson] = React.useState<File | null>(null);
  const [summary, setSummary] = React.useState<CleanserSummary | null>(null);
  
  const csvInputRef = useRef<HTMLInputElement>(null);
  const jsonInputRef = useRef<HTMLInputElement>(null);

  const has = state.cleaned.length > 0;

  async function doCleanse() {
    showLoad('Cleansing…', 'Applying automated fix rules');
    [0, 1, 2, 3, 4, 5, 6, 7].forEach((i) => setTimeout(() => tick(i), 280 + i * 260));
    
    try {
      let res;
      if (source === 'harmonized') {
        if (!state.projectId || !state.obj) {
          throw new Error("Project or Object not selected.");
        }
        res = await fetch('/api/sap/cleanser/flow', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            project_id: state.projectId,
            target_object: state.obj
          })
        });
      } else {
        if (!standaloneCsv) {
          throw new Error("Upload harmonization CSV first.");
        }
        const formData = new FormData();
        formData.append('harmonization_csv', standaloneCsv);
        if (standaloneValidationJson) {
          formData.append('validation_report_json', standaloneValidationJson);
        }

        res = await fetch('/api/sap/cleanser/upload-csv', {
          method: 'POST',
          body: formData,
        });
      }

      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.detail || 'Cleanser failed');
      
      setSummary(data.summary || null);
      
      const fixesCount = (data.summary?.validation_fixes?.count || 0) + (data.summary?.cleanser_fixes?.count || 0);

      dispatch({
        type: 'BATCH_UPDATE',
        updates: {
          cleaned: data.cleaned,
          isCleansedSaved: false,
          stats: { ...state.stats, fixes: fixesCount },
        },
      });

      hideLoad();
      toast(`Cleansed ${data.cleaned.length} records · ${fixesCount} auto-fixes applied`, 'ok');
    } catch (err: any) {
      hideLoad();
      toast(err.message || 'Cleanser failed', 'err');
    }
  }

  const saveDataToDB = async () => {
    if (!state.projectId || !state.obj) {
      toast('Project or Object not selected', 'err');
      return;
    }
    
    showLoad('Saving data...', 'Persisting cleansed records to database');
    try {
      const res = await fetch('/api/sap/cleanser/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: state.projectId,
          target_object: state.obj,
          payload: state.cleaned
        })
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Failed to save');
      
      dispatch({ type: 'SET_FIELD', field: 'isCleansedSaved', value: true });
      hideLoad();
      toast('Cleansed data saved successfully!', 'ok');
    } catch (err: any) {
      hideLoad();
      toast(err.message || 'Error saving data', 'err');
    }
  };

  return (
    <PageLayout>
      <PageGrid>
        {/* Left Column */}
        <GridCol span={3}>
          <Card>
            <CardHeader title="Cleansing Rules" />
            <CardBody className="p-3 space-y-3">
              {[
                ['Trim Whitespace', 'Leading/trailing spaces'],
                ['Country→ISO', 'Full names to 2-3 char'],
                ['Currency→ISO', 'Map to ISO 4217'],
                ['PayTerms→SAP', 'Text to NT30 keys'],
                ['MatType→SAP', 'ROH/FERT/HALB/HAWA'],
                ['Pad Numeric IDs', 'KUNNR/LIFNR 10 digits'],
                ['UPPERCASE Codes', 'Org & code fields'],
                ['Clean Tax Numbers', 'Remove special chars'],
                ['Truncate Overlength', 'SAP max field length'],
                ['Fill Empty Fields', 'Set null to blank']
              ].map(([t, d]) => (
                <div key={t} className="px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--bg-tertiary)]/50">
                  <div className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400">✓ {t}</div>
                  <div className="text-[10px] text-[var(--text-tertiary)]">{d}</div>
                </div>
              ))}
            </CardBody>
          </Card>
        </GridCol>

        {/* Middle Column */}
        <GridCol span={6}>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-[var(--text-primary)]">Step 6 — AI Cleanse & Fix</h1>
            <p className="mt-1 max-w-2xl text-sm text-[var(--text-secondary)]">AI autonomously resolves validation errors based on master data context and business rules</p>
          </div>

          <div className="flex items-center gap-2 mt-4">
            <button
              onClick={() => { setSource('harmonized'); dispatch({ type: 'BATCH_UPDATE', updates: { cleaned: [], isCleansedSaved: false } }); setSummary(null); }}
              className={`
                px-3.5 py-1.5 rounded-lg text-[11.5px] font-semibold transition-all duration-200 border
                ${source === 'harmonized'
                  ? 'bg-violet-600 text-white border-violet-600 shadow-md shadow-violet-600/20'
                  : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] border-[var(--border)] hover:border-violet-300'}
              `}
            >
              ⚡ Flow
            </button>
            <button
              onClick={() => { setSource('upload'); dispatch({ type: 'BATCH_UPDATE', updates: { cleaned: [], isCleansedSaved: false } }); setSummary(null); }}
              className={`
                px-3.5 py-1.5 rounded-lg text-[11.5px] font-semibold transition-all duration-200 border
                ${source === 'upload'
                  ? 'bg-violet-600 text-white border-violet-600 shadow-md shadow-violet-600/20'
                  : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] border-[var(--border)] hover:border-violet-300'}
              `}
            >
              📄 Upload CSV
            </button>
          </div>

          {source === 'upload' && (
            <div className="flex flex-col gap-3 mt-4 border-t border-[var(--border)] pt-4 mb-2">
              <div className="flex items-center gap-2">
                <input
                  ref={csvInputRef}
                  type="file"
                  accept=".csv"
                  className="hidden"
                  onChange={(e) => setStandaloneCsv(e.target.files?.[0] || null)}
                />
                <Button variant="secondary" size="sm" icon={<Upload className="w-3.5 h-3.5" />} onClick={() => csvInputRef.current?.click()}>
                  {standaloneCsv ? standaloneCsv.name : 'Choose Harmonization CSV…'}
                </Button>
                <span className="text-[10.5px] text-[var(--text-tertiary)]">(Required)</span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  ref={jsonInputRef}
                  type="file"
                  accept=".json"
                  className="hidden"
                  onChange={(e) => setStandaloneValidationJson(e.target.files?.[0] || null)}
                />
                <Button variant="secondary" size="sm" icon={<Upload className="w-3.5 h-3.5" />} onClick={() => jsonInputRef.current?.click()}>
                  {standaloneValidationJson ? standaloneValidationJson.name : 'Choose Validation Report JSON…'}
                </Button>
                <span className="text-[10.5px] text-[var(--text-tertiary)]">(Optional)</span>
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2 border-t border-[var(--border)] pt-3 mt-4 mb-4">
            <Button variant="secondary" icon={<ArrowLeft className="w-3.5 h-3.5" />} onClick={() => navigate('/validate')}>Back</Button>
            <Button variant="cyan" icon={<Bot className="w-3.5 h-3.5" />} onClick={doCleanse} disabled={source === 'upload' && !standaloneCsv}>
              Auto-Fix with AI
            </Button>
            
            <div title={!has ? "Run cleanse first before saving." : ""}>
              <Button variant="secondary" icon={<Save className="w-3.5 h-3.5" />} onClick={saveDataToDB} disabled={!has}>Save Data</Button>
            </div>
            <div title={!state.isCleansedSaved ? "You must save your data before proceeding to Step 7." : ""}>
              <Button variant="primary" icon={<ArrowRight className="w-3.5 h-3.5" />} onClick={() => navigate('/transform')} disabled={!state.isCleansedSaved}>Next: Transform</Button>
            </div>
          </div>

          {summary && (
            <Card className="mb-4">
              <CardHeader title="Cleaning Summary" />
              <CardBody className="space-y-4">
                <StatsGrid>
                  <StatBox value={summary.rows_loaded ?? 0} label="Rows Loaded" color="var(--color-primary-500)" />
                  <StatBox value={summary.rows_modified_count ?? 0} label="Rows Modified" color="var(--color-warning)" />
                  <StatBox value={summary.validation_fixes?.count ?? 0} label="Validation Fixes" color="var(--color-teal)" />
                  <StatBox value={summary.cleanser_fixes?.count ?? 0} label="Cleanser Fixes" color="var(--color-success)" />
                </StatsGrid>
                <div>
                  <div className="text-[11.5px] font-bold text-[var(--text-secondary)] mb-2">Warnings ({summary.warnings?.length ?? 0})</div>
                  {summary.warnings?.length ? (
                    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-tertiary)] p-3 space-y-1.5 max-h-44 overflow-y-auto">
                      {summary.warnings.map((warning, i) => (
                        <div key={i} className="text-[11px] text-amber-600 dark:text-amber-400">
                          {warning}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <InfoBox variant="success">No warnings returned by the standalone cleanser.</InfoBox>
                  )}
                </div>
              </CardBody>
            </Card>
          )}

          <Card>
            <CardHeader title="Cleansed Data">
              {has && <Button variant="secondary" size="sm" icon={<Download className="w-3 h-3" />} onClick={() => dl(expCSV(state.cleaned), 'cleaned.csv', 'text/csv')} className="ml-auto">Export CSV</Button>}
            </CardHeader>
            <CardBody>
              {has ? (
                <DataTable rows={state.cleaned.slice(0, 8)} cols={Object.keys(state.cleaned[0] || {})} />
              ) : (
                <EmptyState icon={<Sparkles className="w-10 h-10 text-primary-500" />} message="Run cleansing to auto-fix data issues" />
              )}
            </CardBody>
          </Card>

        </GridCol>

        {/* Right Column */}
        <GridCol span={3}>
          <Card>
            <CardBody className="p-3 space-y-4">
              {has ? (
                <>
                  <InfoBox variant="success">
                    <strong>✓ Auto-fixed:</strong><br />
                    Country codes normalized<br />
                    Currency standardized<br />
                    IDs padded to 10 digits<br />
                    Special chars removed<br />
                    Whitespace trimmed<br />
                    Payment terms mapped
                  </InfoBox>
                  <InfoBox variant="warning">
                    <strong>⚠ Manual review:</strong><br />
                    Empty required fields<br />
                    Invalid email formats<br />
                    Overlength descriptions
                  </InfoBox>
                </>
              ) : (
                <InfoBox variant="info">Run cleansing to see before/after comparison</InfoBox>
              )}
            </CardBody>
          </Card>
        </GridCol>

      </PageGrid>
    </PageLayout>
  );
}

