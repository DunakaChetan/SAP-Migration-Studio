import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMigration } from '@/store/migration-store';
import { useToast } from '@/components/ui/toast';
import { useLoading } from '@/components/ui/loading-overlay';
import { dl, expCSV } from '@/lib/utils';
import { PageLayout, PageGrid, GridCol, Card, CardHeader, CardBody, Button, StatBox, StatsGrid, DataTable, PageHeader, EmptyState } from '@/components/shared';
import { ArrowLeft, ArrowRight, Cog, Download, Upload, FileText, Search, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, FileSpreadsheet, Save, Check, Bot, Sparkles, X } from 'lucide-react';

const AUDIT_PAGE_SIZE = 15;

export function Step7Transform() {
  const { state, dispatch } = useMigration();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { showLoad, hideLoad } = useLoading();
  
  const [mappingFile, setMappingFile] = useState<File | null>(null);
  const [aiPrompt, setAiPrompt] = useState('');
  
  const summary = state.transformSummary;
  
  // Audit log state
  const [openAuditAccordion, setOpenAuditAccordion] = useState(true);
  const [auditSearch, setAuditSearch] = useState('');
  const [auditPage, setAuditPage] = useState(1);
  const [openPreviewAccordion, setOpenPreviewAccordion] = useState(true);

  const transformedRows = state.transformed || [];
  const has = transformedRows.length > 0;
  
  // File upload handler
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setMappingFile(e.target.files[0]);
    }
  };

  async function doTransform() {
    if (!mappingFile) {
      toast('Please upload a mapping file (CSV/Excel) first.', 'err');
      return;
    }
    
    if (!state.projectId) {
      toast('Project ID not found. Please extract data first.', 'err');
      return;
    }

    showLoad('Applying Mappings...', 'Finding and replacing data based on your file...');
    
    const formData = new FormData();
    formData.append('project_id', state.projectId);
    formData.append('target_object', state.obj);
    formData.append('file', mappingFile);

    try {
      const res = await fetch(`${import.meta.env.VITE_BACKEND_URL}/api/sap/transform/apply-mappings`, {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Failed to apply mappings');
      }

      const data = await res.json();
      
      dispatch({ type: 'SET_FIELD', field: 'transformed', value: data.data });
      dispatch({ type: 'SET_FIELD', field: 'transformSummary', value: data.summary });
      dispatch({ type: 'SET_FIELD', field: 'isTransformedSaved', value: false });
      
      toast(`Transformed data successfully. ${data.summary.total_modifications} replacements made.`, 'ok');
    } catch (err: any) {
      toast(err.message, 'err');
    } finally {
      hideLoad();
    }
  }

  async function doAITransform() {
    if (!aiPrompt.trim()) {
      toast('Please enter instructions for the AI.', 'err');
      return;
    }
    
    if (!state.projectId) {
      toast('Project ID not found. Please extract data first.', 'err');
      return;
    }

    showLoad('AI is analyzing...', 'Extracting mapping rules from your instructions...');
    
    try {
      const res = await fetch(`${import.meta.env.VITE_BACKEND_URL}/api/sap/transform/ai-apply-mappings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: state.projectId,
          target_object: state.obj,
          prompt: aiPrompt
        })
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Failed to apply AI mappings');
      }

      const data = await res.json();
      
      const updatedSummary = { ...data.summary, ai_rules: data.ai_rules };
      
      dispatch({ type: 'SET_FIELD', field: 'transformed', value: data.data });
      dispatch({ type: 'SET_FIELD', field: 'transformSummary', value: updatedSummary });
      dispatch({ type: 'SET_FIELD', field: 'isTransformedSaved', value: false });
      
      toast(`AI Transformation successful! Parsed ${data.ai_rules.length} rules.`, 'ok');
    } catch (err: any) {
      toast(err.message, 'err');
    } finally {
      hideLoad();
    }
  }

  async function saveToDatabase() {
    if (!state.projectId) return;
    showLoad('Saving data...', 'Persisting transformed records to database');
    try {
      const res = await fetch(`${import.meta.env.VITE_BACKEND_URL}/api/sap/transform/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: state.projectId,
          target_object: state.obj,
          payload: state.transformed
        })
      });

      if (!res.ok) throw new Error('Failed to save data');

      dispatch({ type: 'SET_FIELD', field: 'isTransformedSaved', value: true });
      toast('Transformed data saved to database successfully!', 'ok');
    } catch (err: any) {
      toast(err.message, 'err');
    } finally {
      hideLoad();
    }
  }

  // Audit Log Filtering & Pagination
  const allAuditItems = summary?.audit_log || [];
  const filteredAuditItems = allAuditItems.filter((item: any) => {
    if (!auditSearch) return true;
    const s = auditSearch.toLowerCase();
    return (
      item.field?.toLowerCase().includes(s) ||
      item.old_value?.toLowerCase().includes(s) ||
      item.new_value?.toLowerCase().includes(s) ||
      String(item.row).includes(s)
    );
  });

  const auditTotalPages = Math.ceil(filteredAuditItems.length / AUDIT_PAGE_SIZE);
  const paginatedAuditItems = filteredAuditItems.slice((auditPage - 1) * AUDIT_PAGE_SIZE, auditPage * AUDIT_PAGE_SIZE);

  return (
    <PageLayout>
      <PageGrid>
        <GridCol span={12}>
          <PageHeader title="Step 7 — Data Transformation" subtitle="Upload a mapping file to automatically find and replace field values">
            <Button variant="secondary" icon={<ArrowLeft className="w-3.5 h-3.5" />} onClick={() => navigate('/cleanse')}>Back</Button>
            {has && (
              <Button 
                variant={state.isTransformedSaved ? "secondary" : "cyan"} 
                icon={state.isTransformedSaved ? <Check className="w-3.5 h-3.5" /> : <Save className="w-3.5 h-3.5" />} 
                onClick={saveToDatabase}
                disabled={state.isTransformedSaved}
              >
                {state.isTransformedSaved ? "Saved" : "Save Data"}
              </Button>
            )}
            <Button variant="primary" icon={<ArrowRight className="w-3.5 h-3.5" />} onClick={() => navigate('/export')} disabled={!state.isTransformedSaved}>Next: DMC Export</Button>
          </PageHeader>

          {/* Transformation Options Box */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            
            {/* File Upload Box */}
            <Card className="h-full">
              <CardHeader title="Upload Mapping File" subtitle="File must contain: Source_Field, Source_Data, Target_Data" />
              <CardBody>
                <div className="flex flex-col gap-4">
                  <div className="flex-1 w-full">
                    <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-[var(--border)] border-dashed rounded-xl cursor-pointer bg-[var(--bg-tertiary)]/30 hover:bg-[var(--bg-tertiary)] hover:border-violet-400 transition-all">
                      <div className="flex flex-col items-center justify-center pt-5 pb-6">
                        <Upload className="w-8 h-8 text-[var(--text-tertiary)] mb-2" />
                        <p className="mb-1 text-sm font-semibold text-[var(--text-secondary)]">Click to upload or drag and drop</p>
                        <p className="text-xs text-[var(--text-tertiary)]">CSV or Excel file</p>
                      </div>
                      <input type="file" className="hidden" accept=".csv,.xlsx,.xls" onChange={handleFileChange} />
                    </label>
                  </div>
                  
                  <div className="w-full flex flex-row items-center gap-3">
                    <div className="flex-1">
                      {mappingFile ? (
                        <div className="p-3 border border-violet-200 dark:border-violet-900 bg-violet-50 dark:bg-violet-900/20 rounded-lg flex items-center gap-3 relative pr-8 h-[50px]">
                          <FileSpreadsheet className="w-5 h-5 text-violet-500 shrink-0" />
                          <div className="overflow-hidden flex-1">
                            <div className="text-sm font-bold text-violet-700 dark:text-violet-300 truncate leading-tight">{mappingFile.name}</div>
                            <div className="text-[10px] text-violet-500 leading-tight">Ready to process</div>
                          </div>
                          <button 
                            className="absolute right-1 top-1/2 -translate-y-1/2 p-1.5 rounded-md text-violet-400 hover:text-violet-700 hover:bg-violet-200/50 transition-colors cursor-pointer"
                            onClick={() => setMappingFile(null)}
                            title="Remove file"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <div className="p-3 border border-[var(--border)] bg-[var(--bg-tertiary)] rounded-lg text-center text-xs text-[var(--text-tertiary)] h-[50px] flex items-center justify-center">
                          No file selected
                        </div>
                      )}
                    </div>
                    
                    <Button 
                      variant="cyan" 
                      icon={<Cog className="w-4 h-4" />} 
                      className="h-[50px]" 
                      disabled={!mappingFile}
                      onClick={doTransform}
                    >
                      Run Transform
                    </Button>
                  </div>
                </div>
              </CardBody>
            </Card>

            {/* AI Chatbot Box */}
            <Card className="h-full">
              <CardHeader 
                title="AI Natural Language Transform" 
                subtitle="Tell the AI what to change, e.g., 'Change NET from 90 to NT90'" 
                icon={<Bot className="w-4 h-4 text-cyan-500" />}
              />
              <CardBody>
                <div className="flex flex-col gap-4">
                  <div className="flex-1 w-full flex flex-col relative group">
                    <textarea
                      value={aiPrompt}
                      onChange={(e) => setAiPrompt(e.target.value)}
                      placeholder="Enter natural language instructions here...&#10;&#10;Examples:&#10;- Change all PLANT values of '1000' to '2000'&#10;- Map 'USD' to 'EUR' in the CURRENCY field"
                      className="w-full h-32 p-4 rounded-xl border border-[var(--border)] bg-[var(--bg-tertiary)]/50 text-[var(--text-primary)] text-sm resize-none focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-all placeholder:text-[var(--text-tertiary)]"
                    />
                    <div className="absolute top-3 right-3 text-cyan-500/30 group-focus-within:text-cyan-500 transition-colors">
                      <Sparkles className="w-5 h-5" />
                    </div>
                  </div>
                  
                  <div className="w-full flex justify-end">
                    <Button 
                      variant="cyan" 
                      icon={<Cog className="w-4 h-4" />} 
                      className="h-[50px] w-full"
                      disabled={!aiPrompt.trim()}
                      onClick={doAITransform}
                    >
                      Run Transform
                    </Button>
                  </div>
                </div>
              </CardBody>
            </Card>

          </div>

          {/* Executive Summary */}
          {summary && (
            <div className="mb-6 space-y-6">
              <div>
                <h3 className="text-sm font-bold text-[var(--text-secondary)] mb-3">Executive Transformation Summary Report</h3>
                <StatsGrid>
                  <StatBox value={summary.rows_loaded} label="Rows Loaded" color="var(--color-primary-500)" />
                  <StatBox value={summary.rows_modified} label="Rows Modified" color="var(--color-warning)" />
                  <StatBox value={summary.total_modifications} label="Total Replacements" color="var(--color-success)" />
                  <StatBox value={summary.mapping_rules_parsed} label="Rules Parsed" color="var(--color-teal)" />
                </StatsGrid>
              </div>

              {summary.ai_rules && summary.ai_rules.length > 0 && (
                <Card>
                  <CardHeader 
                    title="Interpreted AI Rules" 
                    subtitle="Here is how the AI interpreted your instructions" 
                    icon={<Bot className="w-4 h-4 text-cyan-500" />}
                  />
                  <CardBody>
                    <div className="flex flex-col gap-3">
                      {summary.ai_rules.map((rule: any, i: number) => {
                        if (rule.Source_Field === "Python Script") {
                          return (
                            <div key={i} className="flex flex-col gap-2 p-3 rounded-lg border border-[var(--border)] bg-[var(--bg-tertiary)]/50 text-[11px] font-mono">
                              <span className="text-violet-500 font-bold">Generated Pandas Script Execution:</span>
                              <pre className="whitespace-pre-wrap text-[var(--text-secondary)] bg-[#1e1e1e] text-[#d4d4d4] p-4 rounded-md overflow-x-auto">
                                {rule.Target_Data.replace(/```python/g, '').replace(/```/g, '').trim()}
                              </pre>
                            </div>
                          );
                        }
                        
                        return (
                          <div key={i} className="flex items-center gap-2 p-2.5 rounded-lg border border-[var(--border)] bg-[var(--bg-tertiary)]/50 text-[11px] font-mono w-fit">
                            <span className="text-violet-500 font-bold">{rule.Source_Field}</span>
                            <span className="text-[var(--text-tertiary)]">:</span>
                            <span className="px-1.5 py-0.5 rounded bg-red-500/10 text-red-600 dark:text-red-400 line-through">
                              {rule.Source_Data || '(empty)'}
                            </span>
                            <span className="text-[var(--text-tertiary)]">→</span>
                            <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-bold">
                              {rule.Target_Data}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </CardBody>
                </Card>
              )}
            </div>
          )}

          {/* Interactive Audit Log Card */}
          {summary && (
            <Card className="mb-6">
              <CardHeader
                title="Transformation Audit Log & Change Trail"
                subtitle={`${allAuditItems.length} cell-level replacement events logged`}
                icon={<FileText className="w-4 h-4 text-violet-600 dark:text-violet-400" />}
              >
                <button
                  onClick={() => setOpenAuditAccordion(!openAuditAccordion)}
                  className="px-2.5 py-1.5 rounded-lg bg-[var(--bg-tertiary)] hover:bg-[var(--border)] text-[11px] font-bold text-violet-600 dark:text-violet-400 flex items-center gap-1.5 cursor-pointer transition-colors border border-[var(--border)]"
                >
                  {openAuditAccordion ? (
                    <>▼ Hide Complete Audit Trail</>
                  ) : (
                    <>▶ View Complete Audit Trail</>
                  )}
                </button>
              </CardHeader>

              {openAuditAccordion && (
                <CardBody className="space-y-3 pt-2">
                  <div className="flex items-center gap-2 p-2 rounded-xl bg-[var(--bg-tertiary)]/50 border border-[var(--border)]">
                    <div className="relative w-full">
                      <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" />
                      <input
                        type="text"
                        value={auditSearch}
                        onChange={(e) => { setAuditSearch(e.target.value); setAuditPage(1); }}
                        placeholder="Search audit log by field, old value, or new value..."
                        className="w-full text-[11px] pl-8 pr-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-violet-500"
                      />
                    </div>
                  </div>

                  {filteredAuditItems.length === 0 ? (
                    <div className="text-center py-6 text-[11px] text-[var(--text-tertiary)] font-mono">
                      No audit log events match your search criteria.
                    </div>
                  ) : (
                    <div className="rounded-xl border border-[var(--border)] overflow-hidden">
                      <table className="w-full text-left border-collapse">
                        <thead className="bg-[var(--bg-tertiary)] text-[10px] font-bold text-[var(--text-tertiary)] uppercase tracking-wider border-b border-[var(--border)]">
                          <tr>
                            <th className="py-2.5 px-3">Row #</th>
                            <th className="py-2.5 px-3">Phase</th>
                            <th className="py-2.5 px-3">Field Name</th>
                            <th className="py-2.5 px-3">Transformation (Before → After)</th>
                            <th className="py-2.5 px-3 text-right">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--border)] text-[10.5px] font-mono">
                          {paginatedAuditItems.map((item: any) => (
                            <tr key={item.id} className="hover:bg-[var(--bg-tertiary)]/40 transition-colors">
                              <td className="py-2 px-3 font-bold text-[var(--text-secondary)]">#{item.row}</td>
                              <td className="py-2 px-3">
                                <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300">
                                  {item.phase}
                                </span>
                              </td>
                              <td className="py-2 px-3 text-violet-600 dark:text-violet-400 font-bold">{item.field}</td>
                              <td className="py-2 px-3">
                                <div className="flex items-center gap-1">
                                  <span className="px-1.5 py-0.5 rounded bg-red-500/10 text-red-600 dark:text-red-400 line-through text-[10px]">
                                    {item.old_value || '(empty)'}
                                  </span>
                                  <span className="text-[var(--text-tertiary)]">→</span>
                                  <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-bold text-[10px]">
                                    {item.new_value}
                                  </span>
                                </div>
                              </td>
                              <td className="py-2 px-3 text-right">
                                <span className="px-1.5 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 text-[9px] font-bold">
                                  APPLIED
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>

                      {auditTotalPages > 1 && (
                        <div className="flex items-center justify-between px-3 py-2 bg-[var(--bg-tertiary)]/50 border-t border-[var(--border)] text-[11px] text-[var(--text-secondary)]">
                          <div>
                            Showing {((auditPage - 1) * AUDIT_PAGE_SIZE) + 1}–{Math.min(auditPage * AUDIT_PAGE_SIZE, filteredAuditItems.length)} of {filteredAuditItems.length}
                          </div>
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => setAuditPage(p => Math.max(1, p - 1))}
                              disabled={auditPage === 1}
                              className="p-1 rounded border border-[var(--border)] bg-[var(--bg-primary)] hover:bg-[var(--bg-tertiary)] disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
                            >
                              <ChevronLeft className="w-3.5 h-3.5" />
                            </button>
                            <span className="px-2 font-mono font-bold">{auditPage} / {auditTotalPages}</span>
                            <button
                              onClick={() => setAuditPage(p => Math.min(auditTotalPages, p + 1))}
                              disabled={auditPage === auditTotalPages}
                              className="p-1 rounded border border-[var(--border)] bg-[var(--bg-primary)] hover:bg-[var(--bg-tertiary)] disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
                            >
                              <ChevronRight className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </CardBody>
              )}
            </Card>
          )}

          {/* Transformed Data Preview */}
          <Card>
            <CardHeader
              title="Transformed Data Preview"
              subtitle={has ? `Displaying ${transformedRows.length} transformed master records` : 'Upload mapping file to run transformation'}
            >
              <div className="flex items-center gap-2">
                {has && (
                  <Button variant="secondary" size="sm" icon={<Download className="w-3 h-3" />} onClick={() => dl(expCSV(transformedRows), 'transformed.csv', 'text/csv')}>
                    Export CSV
                  </Button>
                )}
                <button
                  onClick={() => setOpenPreviewAccordion(!openPreviewAccordion)}
                  className="p-1.5 rounded-lg hover:bg-[var(--bg-tertiary)] text-[var(--text-tertiary)] cursor-pointer transition-colors"
                >
                  {openPreviewAccordion ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>
              </div>
            </CardHeader>
            {openPreviewAccordion && (
              <CardBody>
                {has ? (
                  <DataTable rows={transformedRows.slice(0, 15)} cols={Object.keys(transformedRows[0] || {})} />
                ) : (
                  <EmptyState icon={<Cog className="w-10 h-10 text-violet-500" />} message="Upload mapping file to run transformation" />
                )}
              </CardBody>
            )}
          </Card>
        </GridCol>
      </PageGrid>
    </PageLayout>
  );
}
