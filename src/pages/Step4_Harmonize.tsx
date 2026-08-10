import React, { useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useToast } from '@/components/ui/toast';
import { useLoading } from '@/components/ui/loading-overlay';
import { dl } from '@/lib/utils';
import {
  PageLayout, PageGrid, GridCol, Card, CardHeader, CardBody, Button,
  StatBox, StatsGrid, DataTable, PageHeader, EmptyState
} from '@/components/shared';
import {
  FlaskConical, Upload, FileSpreadsheet, MapPin, Download,
  Play, Trash2, CheckCircle2, AlertCircle, FileText, ArrowLeft, ArrowRight, Save
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useMigration } from '@/store/migration-store';

/* ─── Types ─── */
interface DroppedFile {
  file: File;
  name: string;
  size: string;
  rows?: number;
}

interface HarmonizationStats {
  total_input: number;
  total_output: number;
  primary_rows?: number;
  secondary_rows?: number;
  deduped?: number;
  empty_removed?: number;
  columns?: number;
  [key: string]: number | undefined;
}

/* ─── Drop Zone Component ─── */
function DropZone({
  id,
  label,
  subtitle,
  icon: Icon,
  accept,
  file,
  onDrop,
  onClear,
  disabled = false,
  accentColor = 'primary',
}: {
  id: string;
  label: string;
  subtitle: string;
  icon: React.ElementType;
  accept: string;
  file: DroppedFile | null;
  onDrop: (f: File) => void;
  onClear: () => void;
  disabled?: boolean;
  accentColor?: string;
}) {
  const [isDragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (disabled) return;
    if (e.type === 'dragenter' || e.type === 'dragover') setDragOver(true);
    else if (e.type === 'dragleave') setDragOver(false);
  }, [disabled]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    if (disabled) return;
    const files = e.dataTransfer.files;
    if (files?.[0]) onDrop(files[0]);
  }, [disabled, onDrop]);

  const handleClick = () => {
    if (!disabled && inputRef.current) inputRef.current.click();
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) onDrop(e.target.files[0]);
  };

  const colorMap: Record<string, { border: string; bg: string; text: string; glow: string }> = {
    primary: {
      border: 'border-primary-400 dark:border-primary-500',
      bg: 'bg-primary-50/50 dark:bg-primary-900/20',
      text: 'text-primary-600 dark:text-primary-400',
      glow: 'shadow-[0_0_20px_rgba(37,99,235,0.15)]',
    },
    teal: {
      border: 'border-teal-400 dark:border-teal-500',
      bg: 'bg-teal-50/50 dark:bg-teal-900/20',
      text: 'text-teal-600 dark:text-teal-400',
      glow: 'shadow-[0_0_20px_rgba(20,184,166,0.15)]',
    },
    violet: {
      border: 'border-violet-400 dark:border-violet-500',
      bg: 'bg-violet-50/50 dark:bg-violet-900/20',
      text: 'text-violet-600 dark:text-violet-400',
      glow: 'shadow-[0_0_20px_rgba(124,58,237,0.15)]',
    },
    amber: {
      border: 'border-amber-400 dark:border-amber-500',
      bg: 'bg-amber-50/50 dark:bg-amber-900/20',
      text: 'text-amber-600 dark:text-amber-400',
      glow: 'shadow-[0_0_20px_rgba(245,158,11,0.15)]',
    },
  };
  const colors = colorMap[accentColor] || colorMap.primary;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <div
        id={id}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        onClick={handleClick}
        className={`
          relative rounded-xl border-2 border-dashed p-5 transition-all duration-300 cursor-pointer
          ${disabled
            ? 'opacity-40 pointer-events-none border-[var(--border)] bg-[var(--bg-tertiary)]/30'
            : file
              ? `border-emerald-400 dark:border-emerald-500 bg-emerald-50/30 dark:bg-emerald-900/10`
              : isDragOver
                ? `${colors.border} ${colors.bg} ${colors.glow} scale-[1.01]`
                : 'border-[var(--border)] bg-[var(--bg-tertiary)]/30 hover:border-[var(--text-tertiary)] hover:bg-[var(--bg-tertiary)]/60'
          }
        `}
      >
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          onChange={handleChange}
          className="hidden"
        />

        <AnimatePresence mode="wait">
          {file ? (
            <motion.div
              key="file-info"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="flex items-center gap-3"
            >
              <div className="w-10 h-10 rounded-lg bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[12px] font-semibold text-[var(--text-primary)] truncate">
                  {file.name}
                </div>
                <div className="text-[10px] text-[var(--text-tertiary)]">
                  {file.size}{file.rows ? ` · ${file.rows} rows` : ''}
                </div>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); onClear(); }}
                className="p-1.5 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/30 text-[var(--text-tertiary)] hover:text-red-500 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </motion.div>
          ) : (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center gap-2 text-center"
            >
              <div className={`w-10 h-10 rounded-lg bg-[var(--bg-tertiary)] flex items-center justify-center ${isDragOver ? colors.text : 'text-[var(--text-tertiary)]'}`}>
                <Icon className="w-5 h-5" />
              </div>
              <div>
                <div className={`text-[12px] font-semibold ${isDragOver ? colors.text : 'text-[var(--text-secondary)]'}`}>
                  {label}
                </div>
                <div className="text-[10px] text-[var(--text-tertiary)] mt-0.5">{subtitle}</div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}


/* ─── Main Page ─── */
export function Step4Harmonize() {
  const { toast } = useToast();
  const { showLoad, tick, hideLoad } = useLoading();
  const navigate = useNavigate();
  const { state, dispatch } = useMigration();

  // State
  const [mode, setMode] = useState<'flow' | 'single' | 'multi'>('flow');
  const [sapObject, setSapObject] = useState(state.obj || 'CUSTOMER');
  const [companyCode, setCompanyCode] = useState(state.cc || '1000');
  const [plant, setPlant] = useState(state.plant || '1000');
  const [currency, setCurrency] = useState(state.curr || 'INR');
  const [salesOrg, setSalesOrg] = useState(state.so || '1000');
  const [purchOrg, setPurchOrg] = useState(state.po || '1000');
  const [distChannel, setDistChannel] = useState(state.distch || '10');
  const [division, setDivision] = useState(state.spart || '00');

  // Files
  const [primaryFile, setPrimaryFile] = useState<DroppedFile | null>(null);
  const [secondaryFile, setSecondaryFile] = useState<DroppedFile | null>(null);
  const [primaryMappingFile, setPrimaryMappingFile] = useState<DroppedFile | null>(null);
  const [secondaryMappingFile, setSecondaryMappingFile] = useState<DroppedFile | null>(null);

  // Results
  const result = state.harmonizationResult;
  const setResult = (val: any) => dispatch({ type: 'SET_FIELD', field: 'harmonizationResult', value: val });

  const saveDataToDB = async () => {
    if (!state.projectId) {
      toast('No project ID found. Please create a project first.', 'err');
      return;
    }
    if (!result?.final_table) return;
    
    showLoad('Saving data...', 'Persisting harmonized records to database');
    try {
      const res = await fetch('/api/sap/harmonize/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: state.projectId,
          target_object: state.obj,
          payload: result.final_table
        })
      });
      
      if (!res.ok) throw new Error('Failed to save data');
      
      hideLoad();
      dispatch({ type: 'SET_FIELD', field: 'isHarmonizedSaved', value: true });
      toast('Harmonized data saved to database successfully!', 'ok');
    } catch (err: any) {
      hideLoad();
      toast(err.message || 'Failed to save data', 'err');
    }
  };

  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleFileDrop = (
    setter: React.Dispatch<React.SetStateAction<DroppedFile | null>>
  ) => async (file: File) => {
    const dropped: DroppedFile = {
      file,
      name: file.name,
      size: formatSize(file.size),
    };

    // Try to count rows for CSV
    if (file.name.endsWith('.csv')) {
      try {
        const text = await file.text();
        const lines = text.split('\n').filter(l => l.trim());
        dropped.rows = Math.max(0, lines.length - 1); // exclude header
      } catch { /* ignore */ }
    }

    setter(dropped);
  };

  const canRun = mode === 'flow' 
    ? true
    : mode === 'single'
      ? !!primaryFile
      : !!(primaryFile && secondaryFile && primaryMappingFile && secondaryMappingFile);

  async function runHarmonization() {
    if (!canRun || (mode !== 'flow' && !primaryFile)) return;
    dispatch({ type: 'SET_FIELD', field: 'isHarmonizedSaved', value: false });

    showLoad('Running Harmonization Agent…', 'Processing your data through 7 rules', [
      'Reading files from Database or Uploads…',
      'Applying field mappings…',
      'Rule 1: Key-based Dedup…',
      'Rule 2: Empty Row Filter…',
      'Rules 3-6: Code conversions…',
      'Rule 7: Whitespace Trim…',
      'Generating results…',
    ]);
    [0, 1, 2, 3, 4, 5, 6].forEach(i => setTimeout(() => tick(i), 300 + i * 350));

    try {
      let res;
      if (mode === 'flow') {
        if (!state.projectId) {
          throw new Error("No Project ID found. Please extract and save data in Step 3 first.");
        }
        res = await fetch('/api/sap/harmonize/flow', { 
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            project_id: state.projectId,
            sap_object: sapObject,
            company_code: companyCode,
            sales_org: salesOrg,
            purch_org: purchOrg,
            plant: plant,
            dist_channel: distChannel,
            division: division,
            currency: currency
          })
        });
      } else {
        const formData = new FormData();
        formData.append('mode', mode);
        formData.append('sap_object', sapObject);
        formData.append('company_code', companyCode);
        formData.append('sales_org', salesOrg);
        formData.append('purch_org', purchOrg);
        formData.append('plant', plant);
        formData.append('dist_channel', distChannel);
        formData.append('division', division);
        formData.append('currency', currency);
        formData.append('primary_file', primaryFile!.file);

        if (primaryMappingFile) formData.append('primary_mapping_file', primaryMappingFile.file);

        if (mode === 'multi') {
          if (secondaryFile) formData.append('secondary_file', secondaryFile.file);
          if (secondaryMappingFile) formData.append('secondary_mapping_file', secondaryMappingFile.file);
        }

        res = await fetch('/api/sap/harmonize', { method: 'POST', body: formData });
      }

      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: 'Unknown error' }));
        throw new Error(err.detail || 'Harmonization failed');
      }

      const data = await res.json();

      setTimeout(() => {
        tick(7, 'Complete');
        setTimeout(() => {
          hideLoad();
          setResult(data);
          toast(
            `Harmonized: ${data.stats.total_output} rows from ${data.stats.total_input} input rows`,
            'ok'
          );
        }, 600);
      }, 500);

    } catch (err: any) {
      hideLoad();
      toast(err.message || 'Harmonization failed', 'err');
    }
  }

  function downloadResult() {
    if (!result?.session_id) return;
    window.open(`/api/sap/harmonize/download/${result.session_id}`, '_blank');
  }

  return (
    <PageLayout>
      <PageGrid>

        {/* ─── Main Column: Drop Zones + Results ─── */}
        <GridCol span={9}>
          <div className="space-y-4">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-[var(--text-primary)]">Step 4 — Harmonization Agent</h1>
              <p className="mt-1 max-w-2xl text-sm text-[var(--text-secondary)]">Upload files, configure parameters, and test the harmonization pipeline</p>
            </div>

            {/* Three mode options below subtitle */}
            <div className="flex items-center gap-2">
              {(['flow', 'single', 'multi'] as const).map(m => (
                <button
                  key={m}
                  onClick={() => { setMode(m); setResult(null); }}
                  className={`
                    px-3.5 py-1.5 rounded-lg text-[11.5px] font-semibold transition-all duration-200 border
                    ${mode === m
                      ? 'bg-violet-600 text-white border-violet-600 shadow-md shadow-violet-600/20'
                      : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] border-[var(--border)] hover:border-violet-300'}
                  `}
                >
                  {m === 'flow' ? '⚡ Flow' : m === 'single' ? '📄 Single' : '🔗 Multi'}
                </button>
              ))}
            </div>

            {/* Action Buttons: Back, Run Harmonization, Save Data, Next: Validation */}
            <div className="flex flex-wrap items-center gap-2 border-t border-[var(--border)] pt-3">
              <Button variant="secondary" icon={<ArrowLeft className="w-3.5 h-3.5" />} onClick={() => navigate('/extract')}>
                Back
              </Button>
              <Button
                variant="primary"
                icon={<Play className="w-3.5 h-3.5" />}
                onClick={runHarmonization}
                disabled={!canRun}
              >
                Run Harmonization
              </Button>
              <div title={!result ? "Run harmonization first before saving." : ""}>
                <Button variant="secondary" icon={<Save className="w-3.5 h-3.5" />} onClick={saveDataToDB} disabled={!result}>Save Data</Button>
              </div>
              <div title={!state.isHarmonizedSaved ? "You must save your data before proceeding to Step 5." : ""}>
                <Button
                  variant="primary"
                  icon={<ArrowRight className="w-3.5 h-3.5" />}
                  onClick={() => navigate('/validate')}
                  disabled={!state.isHarmonizedSaved}
                >
                  Next: Validation
                </Button>
              </div>
            </div>
          </div>

          {/* Drop Zones / DB Fetch */}
          {mode !== 'flow' && (
            <Card>
              <CardHeader
                title={mode === 'multi' ? 'Upload Files (Multi-Source)' : 'Upload Files (Single-Source)'}
                subtitle={mode === 'multi' ? 'Primary data + Secondary data + 2 mapping files' : 'Data file + optional Mapping CSV'}
              />
              <CardBody className="p-4">
                <div className="grid grid-cols-2 gap-3">
                <DropZone
                  id="drop-primary"
                  label={mode === 'multi' ? "Primary Data File" : "Data File"}
                  subtitle="Drag & drop CSV or Excel"
                  icon={FileSpreadsheet}
                  accept=".csv,.xlsx,.xls"
                  file={primaryFile}
                  onDrop={handleFileDrop(setPrimaryFile)}
                  onClear={() => setPrimaryFile(null)}
                  accentColor="primary"
                />

                <DropZone
                  id="drop-primary-mapping"
                  label={mode === 'multi' ? "Primary Mapping CSV" : "Mapping CSV (Optional)"}
                  subtitle="Columns: src, sap, transform, confidence"
                  icon={MapPin}
                  accept=".csv"
                  file={primaryMappingFile}
                  onDrop={handleFileDrop(setPrimaryMappingFile)}
                  onClear={() => setPrimaryMappingFile(null)}
                  accentColor="violet"
                />

                {mode === 'multi' && (
                  <>
                    <DropZone
                      id="drop-secondary"
                      label="Secondary Data File"
                      subtitle="Drag & drop CSV or Excel"
                      icon={FileSpreadsheet}
                      accept=".csv,.xlsx,.xls"
                      file={secondaryFile}
                      onDrop={handleFileDrop(setSecondaryFile)}
                      onClear={() => setSecondaryFile(null)}
                      accentColor="teal"
                    />

                    <DropZone
                      id="drop-secondary-mapping"
                      label="Secondary Mapping CSV"
                      subtitle="Columns: src, sap, transform, confidence"
                      icon={MapPin}
                      accept=".csv"
                      file={secondaryMappingFile}
                      onDrop={handleFileDrop(setSecondaryMappingFile)}
                      onClear={() => setSecondaryMappingFile(null)}
                      accentColor="amber"
                    />
                  </>
                )}
              </div>

              {mode === 'single' && (
                <div className="mt-3 px-3 py-2 rounded-lg bg-[var(--bg-tertiary)]/50 border border-[var(--border)]">
                  <div className="text-[10px] text-[var(--text-tertiary)]">
                    <strong>Single mode:</strong> Upload your data file. If a Mapping CSV is provided, fields will be mapped and output headers will use short SAP target field names (after the dot, e.g. <code>KUNNR</code>, <code>NAME1</code>, <code>LAND1</code>).
                  </div>
                </div>
              )}
              </CardBody>
            </Card>
          )}

          {/* Results Table */}
          {result && (
            <Card>
              <CardHeader
                title="Harmonized Output"
                subtitle={`${result.stats.total_output} rows × ${result.columns.length} columns`}
              >
                <Button
                  variant="secondary"
                  size="sm"
                  icon={<Download className="w-3 h-3" />}
                  onClick={downloadResult}
                  className="ml-auto"
                >
                  Export CSV
                </Button>
              </CardHeader>
              <CardBody>
                <DataTable
                  rows={result.final_table.slice(0, 15)}
                  cols={result.columns}
                />
                {result.final_table.length > 15 && (
                  <div className="text-[10px] text-[var(--text-tertiary)] text-center py-2 border-t border-[var(--border)]">
                    Showing 15 of {result.final_table.length} rows · Download CSV for full data
                  </div>
                )}
              </CardBody>
            </Card>
          )}

          {!result && (
            <Card>
              <CardBody>
                <EmptyState
                  icon={<FlaskConical className="w-10 h-10 text-violet-500" />}
                  message="Upload your files and click Run Harmonization to see results"
                />
              </CardBody>
            </Card>
          )}
        </GridCol>

        {/* ─── Right Column: Results & Fix Log ─── */}
        <GridCol span={3}>
          {result ? (
            <>
              <Card>
                <CardHeader title="Stats" />
                <CardBody className="p-3 space-y-2">
                  {Object.entries(result.stats).map(([k, v]) => (
                    <div key={k} className="flex justify-between px-2.5 py-1.5 rounded-lg bg-[var(--bg-tertiary)] text-[11px]">
                      <span className="text-[var(--text-tertiary)]">{k.replace(/_/g, ' ')}</span>
                      <span className="font-mono font-bold text-[var(--text-primary)]">{v}</span>
                    </div>
                  ))}
                </CardBody>
              </Card>

              <Card>
                <CardHeader title="Fix Log" subtitle={`${result.fix_log.length} entries`} />
                <CardBody className="p-3">
                  <div className="space-y-1 max-h-[400px] overflow-y-auto scrollbar-thin scrollbar-thumb-[var(--border-light)] scrollbar-track-transparent">
                    {result.fix_log.map((log, i) => {
                      const isRule = log.startsWith('[');
                      const bracket = log.match(/^\[([^\]]+)\]/)?.[1] || '';
                      const rest = log.replace(/^\[[^\]]+\]\s*/, '');
                      return (
                        <div key={i} className="px-2.5 py-1.5 rounded-lg bg-[var(--bg-tertiary)]/50 text-[10px]">
                          {isRule && (
                            <span className="font-mono font-bold text-violet-600 dark:text-violet-400 mr-1">
                              [{bracket}]
                            </span>
                          )}
                          <span className="text-[var(--text-secondary)]">{rest}</span>
                        </div>
                      );
                    })}
                  </div>
                </CardBody>
              </Card>
            </>
          ) : (
            <Card>
              <CardHeader title="7 Harmonization Rules" />
              <CardBody className="p-3 space-y-2">
                {[
                  ['Key-based Dedup', 'Remove duplicate key field rows', '🔑'],
                  ['Empty Row Filter', 'Remove 100% empty records', '🗑️'],
                  ['Country → ISO', 'Full names to 2-3 letter ISO', '🌍'],
                  ['Currency → ISO', 'Map to ISO 4217 3-letter', '💱'],
                  ['PayTerms → SAP', 'Convert text to NT30/NT45 etc', '💳'],
                  ['MatType → SAP', 'Convert to ROH/FERT/HALB etc', '📦'],
                  ['Whitespace Trim', 'All fields trimmed', '✂️'],
                ].map(([t, d, emoji], i) => (
                  <div key={i} className="flex items-start gap-2 px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--bg-tertiary)]/50">
                    <span className="text-sm mt-0.5">{emoji}</span>
                    <div>
                      <div className="text-[11.5px] font-bold text-[var(--text-primary)]">{t}</div>
                      <div className="text-[10px] text-[var(--text-tertiary)]">{d}</div>
                    </div>
                  </div>
                ))}

                <div className="border-t border-[var(--border)] my-2" />

                <div className="text-[10px] text-[var(--text-tertiary)] px-1">
                  <strong>Mapping CSV format:</strong>
                  <div className="font-mono mt-1 p-2 rounded bg-[var(--bg-tertiary)] text-[9px]">
                    src,sap,transform,confidence<br />
                    PARTY_NAME,NAME1,trim,90<br />
                    COUNTRY_CODE,LAND1,country,85<br />
                    CURRENCY,WAERS,currency,80
                  </div>
                </div>
              </CardBody>
            </Card>
          )}
        </GridCol>

      </PageGrid>
    </PageLayout>
  );
}
