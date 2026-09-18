import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button, Badge } from '@/components/shared';
import { useToast } from '@/components/ui/toast';
import {
  FileSpreadsheet,
  Download,
  Upload,
  CheckCircle2,
  AlertTriangle,
  X,
  RotateCcw,
  Loader2,
  Database,
  Layers,
  TableProperties
} from 'lucide-react';

interface TargetObjectImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (objectName: string) => void;
}

interface ParsedField {
  sheet_name?: string;
  group_name?: string;
  sap_structure?: string;
  field_name: string;
  field_description: string;
  type: string;
  length?: string;
  decimals?: string;
  is_mandatory: boolean;
}

interface DetectedMappings {
  structure_source: string;
  field_column: string;
  label_column: string;
  type_column: string;
  required_column: string;
}

interface ValidationResponse {
  valid: boolean;
  sheet_names: string[];
  selected_sheet: string;
  detected_table_name: string;
  suggested_object_name: string;
  structures?: string[];
  total_fields: number;
  mandatory_count: number;
  preview: ParsedField[];
  fields: ParsedField[];
  error?: string;
  missing_columns?: string[];
  found_columns?: string[];
  detected_mappings?: DetectedMappings;
}

export function TargetObjectImportModal({
  isOpen,
  onClose,
  onSuccess,
}: TargetObjectImportModalProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<'upload' | 'preview'>('upload');
  const [isUploading, setIsUploading] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [requiredColumns, setRequiredColumns] = useState<string[]>([]);

  // Current uploaded file preserved for tab switching
  const [currentFile, setCurrentFile] = useState<File | null>(null);
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [selectedSheet, setSelectedSheet] = useState<string>('');

  const [parsedData, setParsedData] = useState<ValidationResponse | null>(null);
  const [targetObjectName, setTargetObjectName] = useState('');
  const [targetObjectDescription, setTargetObjectDescription] = useState('');

  const resetState = () => {
    setStep('upload');
    setIsUploading(false);
    setIsImporting(false);
    setValidationError(null);
    setRequiredColumns([]);
    setCurrentFile(null);
    setSheetNames([]);
    setSelectedSheet('');
    setParsedData(null);
    setTargetObjectName('');
    setTargetObjectDescription('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleClose = () => {
    resetState();
    onClose();
  };

  const getBackendUrl = () => {
    return (import.meta.env.VITE_BACKEND_URL || 'http://127.0.0.1:8000').replace(/\/+$/, '');
  };

  // 1. Download official sample template
  const handleDownloadTemplate = () => {
    try {
      const downloadUrl = `${getBackendUrl()}/api/sap/target-objects/template`;
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.setAttribute('download', 'SAP_Migration_Object_Mapping_Template.xlsx');
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast('SAP Migration Cockpit template downloaded', 'ok');
    } catch (err: any) {
      toast('Failed to initiate template download', 'err');
    }
  };

  // 2. Validate sheet helper
  const validateFile = async (file: File, sheetToValidate?: string) => {
    setIsUploading(true);
    setValidationError(null);

    const formData = new FormData();
    formData.append('file', file);
    if (sheetToValidate) {
      formData.append('selected_sheet', sheetToValidate);
    }

    try {
      const res = await fetch(`${getBackendUrl()}/api/sap/target-objects/validate-sheet`, {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();

      if (data.sheet_names && data.sheet_names.length > 0) {
        setSheetNames(data.sheet_names);
      }

      if (!res.ok || !data.valid) {
        setValidationError(data.error || 'The selected tab does not contain standard SAP field definitions.');
        setRequiredColumns(data.required_columns || ['SAP Field', 'SAP Structure', 'Field Description']);
        setSelectedSheet(data.selected_sheet || sheetToValidate || '');
        setStep('upload');
        setIsUploading(false);
        return;
      }

      // Valid format
      setParsedData(data);
      setSelectedSheet(data.selected_sheet);
      const suggested = data.suggested_object_name || data.detected_table_name || 'Custom Target Object';
      setTargetObjectName(suggested);
      setTargetObjectDescription(`Target Object with ${data.total_fields} fields across ${data.structures?.length || 1} structures`);
      setStep('preview');
      toast(`Verified tab "${data.selected_sheet}": ${data.total_fields} fields found!`, 'ok');
    } catch (err: any) {
      setValidationError('Failed to validate the spreadsheet. Please verify backend connectivity.');
    } finally {
      setIsUploading(false);
    }
  };

  // 3. File Input Change Handler
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const ext = file.name.toLowerCase();
    if (!ext.endsWith('.xlsx') && !ext.endsWith('.xls') && !ext.endsWith('.csv')) {
      setValidationError('Please upload an Excel spreadsheet (.xlsx, .xls) or CSV file.');
      return;
    }

    setCurrentFile(file);
    await validateFile(file);
  };

  // 4. Tab Selector Change Handler
  const handleTabSelect = async (sheetName: string) => {
    if (!currentFile || sheetName === selectedSheet) return;
    setSelectedSheet(sheetName);
    await validateFile(currentFile, sheetName);
  };

  // 5. Confirm import and upsert into sap_objects & sap_fields
  const handleConfirmImport = async () => {
    if (!targetObjectName.trim()) {
      toast('Please enter a Target Object Name.', 'err');
      return;
    }
    if (!parsedData || !parsedData.fields || parsedData.fields.length === 0) {
      toast('No field records available to import.', 'err');
      return;
    }

    setIsImporting(true);
    try {
      const res = await fetch(`${getBackendUrl()}/api/sap/target-objects/confirm-import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          object_name: targetObjectName.trim(),
          description: targetObjectDescription.trim(),
          fields: parsedData.fields,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || 'Failed to import target object.');
      }

      toast(data.message || `Imported ${data.total_fields} fields for '${targetObjectName}'!`, 'ok');
      onSuccess(targetObjectName.trim());
      handleClose();
    } catch (err: any) {
      toast(err.message || 'Failed to confirm target object import.', 'err');
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/50 backdrop-blur-xs"
            onClick={handleClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ type: 'spring', duration: 0.35, bounce: 0.1 }}
            className="relative w-full max-w-3xl overflow-hidden rounded-2xl bg-[var(--bg-secondary)] border border-[var(--border)] shadow-2xl z-10 flex flex-col max-h-[90vh]"
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)] bg-[var(--bg-tertiary)]/40">
              <div className="flex items-center gap-3">
                <div className="size-9 rounded-xl bg-teal-500/10 border border-teal-500/20 text-teal-600 dark:text-teal-400 flex items-center justify-center shrink-0">
                  <FileSpreadsheet className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-[var(--text-primary)]">
                    Upload Target Object & Fields
                  </h3>
                  <p className="text-[11.5px] text-[var(--text-tertiary)]">
                    Import SAP S/4HANA Migration Cockpit definitions dynamically with multi-tab workbook support
                  </p>
                </div>
              </div>
              <button
                onClick={handleClose}
                className="p-1.5 rounded-lg hover:bg-[var(--bg-tertiary)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-5 flex-1">
              {/* Template Download Notification Card */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3.5 rounded-xl border border-teal-500/20 bg-teal-500/5 text-xs text-[var(--text-secondary)]">
                <div className="space-y-0.5">
                  <div className="font-semibold text-teal-600 dark:text-teal-400 flex items-center gap-1.5">
                    <Database className="w-3.5 h-3.5" />
                    Standard Cockpit Format Supported
                  </div>
                  <div className="text-[11px] text-[var(--text-tertiary)]">
                    Compatible with SAP Migration Cockpit: <strong className="font-mono text-[var(--text-secondary)]">Sheet Name, Group Name, Field Description, Importance, Type, Length, SAP Structure, SAP Field</strong>
                  </div>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  icon={<Download className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />}
                  onClick={handleDownloadTemplate}
                  className="shrink-0"
                >
                  Download Template (.xlsx)
                </Button>
              </div>

              {/* Multi-Tab Selector (Rendered whenever a multi-tab workbook is uploaded) */}
              {sheetNames.length > 1 && (
                <div className="p-3 rounded-xl border border-[var(--border)] bg-[var(--bg-tertiary)]/50 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-[var(--text-secondary)] flex items-center gap-1.5">
                      <TableProperties className="w-3.5 h-3.5 text-teal-500" />
                      Select Workbook Tab / Sheet:
                    </span>
                    <span className="text-[10.5px] text-[var(--text-tertiary)]">
                      {sheetNames.length} tabs found in file
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {sheetNames.map((name) => {
                      const isSelected = selectedSheet === name;
                      return (
                        <button
                          key={name}
                          type="button"
                          disabled={isUploading}
                          onClick={() => handleTabSelect(name)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 cursor-pointer border ${
                            isSelected
                              ? 'bg-teal-500 text-white border-teal-600 shadow-xs'
                              : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] border-[var(--border)] hover:border-teal-500/50 hover:bg-[var(--bg-tertiary)]'
                          }`}
                        >
                          <FileSpreadsheet className={`w-3.5 h-3.5 ${isSelected ? 'text-white' : 'text-teal-600 dark:text-teal-400'}`} />
                          <span>{name}</span>
                          {isSelected && <CheckCircle2 className="w-3 h-3 text-white ml-0.5" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* STEP 1: UPLOAD VIEW */}
              {step === 'upload' && (
                <div className="space-y-4">
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all flex flex-col items-center justify-center gap-3 ${
                      isUploading
                        ? 'border-teal-500 bg-teal-500/5 cursor-wait'
                        : 'border-[var(--border)] hover:border-teal-500/60 hover:bg-[var(--bg-tertiary)]/40'
                    }`}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".xlsx,.xls,.csv"
                      className="hidden"
                      onChange={handleFileChange}
                      disabled={isUploading}
                    />

                    <div className="size-12 rounded-2xl bg-teal-500/10 text-teal-600 dark:text-teal-400 flex items-center justify-center">
                      {isUploading ? (
                        <Loader2 className="w-6 h-6 animate-spin" />
                      ) : (
                        <Upload className="w-6 h-6" />
                      )}
                    </div>

                    <div className="space-y-1">
                      <p className="text-xs font-bold text-[var(--text-primary)]">
                        {isUploading ? 'Validating spreadsheet format...' : 'Click to browse or drag & drop target specification sheet'}
                      </p>
                      <p className="text-[11px] text-[var(--text-tertiary)] font-mono">
                        Supports Excel (.xlsx, .xls) files with single or multiple tabs
                      </p>
                    </div>
                  </div>

                  {/* Format Validation Error Banner */}
                  {validationError && (
                    <motion.div
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="p-4 rounded-xl border border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400 text-xs space-y-3"
                    >
                      <div className="flex items-start gap-2.5">
                        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                        <div className="space-y-1">
                          <div className="font-bold text-[13px]">Invalid Format in Selected Tab</div>
                          <div className="text-[11.5px] leading-relaxed text-red-600/90 dark:text-red-400/90">
                            {validationError}
                          </div>
                        </div>
                      </div>

                      {requiredColumns.length > 0 && (
                        <div className="text-[11px] font-mono bg-red-500/10 p-2.5 rounded-lg border border-red-500/20 space-y-1">
                          <span className="text-[10px] uppercase font-bold text-red-600 dark:text-red-400 tracking-wider">
                            Required Cockpit Columns for Target Object:
                          </span>
                          <div className="flex flex-wrap gap-1.5 mt-1">
                            {requiredColumns.map((col, idx) => (
                              <span
                                key={idx}
                                className="px-2 py-0.5 rounded bg-[var(--bg-secondary)] border border-[var(--border)] text-[var(--text-primary)] text-[10.5px]"
                              >
                                {col}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {sheetNames.length > 1 && (
                        <div className="text-[11.5px] text-[var(--text-secondary)] bg-[var(--bg-secondary)] p-2.5 rounded-lg border border-[var(--border)] flex items-center gap-2">
                          <span className="text-amber-500 font-bold">💡 Tip:</span>
                          <span>If your target fields are in another tab (e.g. <code>Sheet1</code>), click on it in the tabs list above.</span>
                        </div>
                      )}

                      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 pt-2 border-t border-red-500/20">
                        <span className="text-[11px] text-[var(--text-tertiary)]">
                          Format your spreadsheet using the standard Cockpit template:
                        </span>
                        <Button
                          variant="secondary"
                          size="sm"
                          icon={<Download className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />}
                          onClick={handleDownloadTemplate}
                        >
                          Download Sample Template (.xlsx)
                        </Button>
                      </div>
                    </motion.div>
                  )}
                </div>
              )}

              {/* STEP 2: OBJECT NAME INPUT & PREVIEW */}
              {step === 'preview' && parsedData && (
                <div className="space-y-4">
                  {/* Dynamic Column Mapping Summary Card */}
                  {parsedData.detected_mappings && (
                    <div className="p-3 rounded-xl border border-teal-500/20 bg-teal-500/5 text-[11px] font-mono space-y-2">
                      <div className="flex items-center justify-between text-teal-600 dark:text-teal-400 font-bold text-[10.5px] uppercase tracking-wider">
                        <span className="flex items-center gap-1.5">
                          <Layers className="w-3.5 h-3.5" />
                          Dynamic Column Resolution
                        </span>
                        <span className="text-[10px] text-emerald-500 font-semibold">✓ Auto-Mapped Successfully</span>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[10.5px]">
                        <div className="p-1.5 rounded bg-[var(--bg-secondary)]/80 border border-[var(--border)]">
                          <span className="text-[9.5px] text-[var(--text-tertiary)] block">Field Column</span>
                          <span className="font-bold text-[var(--text-primary)] truncate block" title={parsedData.detected_mappings.field_column}>
                            {parsedData.detected_mappings.field_column}
                          </span>
                        </div>
                        <div className="p-1.5 rounded bg-[var(--bg-secondary)]/80 border border-[var(--border)]">
                          <span className="text-[9.5px] text-[var(--text-tertiary)] block">Description</span>
                          <span className="font-bold text-[var(--text-primary)] truncate block" title={parsedData.detected_mappings.label_column}>
                            {parsedData.detected_mappings.label_column}
                          </span>
                        </div>
                        <div className="p-1.5 rounded bg-[var(--bg-secondary)]/80 border border-[var(--border)]">
                          <span className="text-[9.5px] text-[var(--text-tertiary)] block">Mandatory</span>
                          <span className="font-bold text-amber-500 truncate block" title={parsedData.detected_mappings.required_column}>
                            {parsedData.detected_mappings.required_column}
                          </span>
                        </div>
                        <div className="p-1.5 rounded bg-[var(--bg-secondary)]/80 border border-[var(--border)]">
                          <span className="text-[9.5px] text-[var(--text-tertiary)] block">Structure / Table</span>
                          <span className="font-bold text-teal-600 dark:text-teal-400 truncate block" title={parsedData.detected_mappings.structure_source}>
                            {parsedData.detected_mappings.structure_source}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Summary Bar */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 font-mono text-[11px]">
                    <div className="p-3 rounded-xl border border-[var(--border)] bg-[var(--bg-tertiary)]/50 space-y-0.5">
                      <span className="text-[10px] text-[var(--text-tertiary)] uppercase font-bold">Structures</span>
                      <div className="text-sm font-bold text-teal-600 dark:text-teal-400">
                        {parsedData.structures && parsedData.structures.length > 0
                          ? `${parsedData.structures.length} (${parsedData.structures.slice(0, 2).join(', ')}${parsedData.structures.length > 2 ? '...' : ''})`
                          : parsedData.detected_table_name}
                      </div>
                    </div>
                    <div className="p-3 rounded-xl border border-[var(--border)] bg-[var(--bg-tertiary)]/50 space-y-0.5">
                      <span className="text-[10px] text-[var(--text-tertiary)] uppercase font-bold">Total Fields</span>
                      <div className="text-sm font-bold text-[var(--text-primary)]">
                        {parsedData.total_fields} fields
                      </div>
                    </div>
                    <div className="p-3 rounded-xl border border-[var(--border)] bg-[var(--bg-tertiary)]/50 space-y-0.5">
                      <span className="text-[10px] text-[var(--text-tertiary)] uppercase font-bold">Mandatory Fields</span>
                      <div className="text-sm font-bold text-amber-500">
                        {parsedData.mandatory_count} required
                      </div>
                    </div>
                  </div>

                  {/* Object Name Input Form */}
                  <div className="p-4 rounded-xl border border-[var(--border)] bg-[var(--bg-tertiary)]/30 space-y-3">
                    <div>
                      <label className="block text-[11px] font-mono font-bold uppercase tracking-wider text-[var(--text-secondary)] mb-1">
                        Target Object Name <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={targetObjectName}
                        onChange={(e) => setTargetObjectName(e.target.value)}
                        placeholder="e.g. Customer, Vendor, Material, Equipment"
                        className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] text-[13px] font-semibold text-[var(--text-primary)] focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
                      />
                      <p className="text-[10.5px] text-[var(--text-tertiary)] mt-1">
                        This target object will appear in the Target Object dropdown across all migration steps.
                      </p>
                    </div>

                    <div>
                      <label className="block text-[11px] font-mono font-bold uppercase tracking-wider text-[var(--text-secondary)] mb-1">
                        Description (Optional)
                      </label>
                      <input
                        type="text"
                        value={targetObjectDescription}
                        onChange={(e) => setTargetObjectDescription(e.target.value)}
                        placeholder="e.g. SAP S/4HANA Business Partner Master"
                        className="w-full px-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] text-xs text-[var(--text-secondary)] focus:outline-none focus:border-teal-500"
                      />
                    </div>
                  </div>

                  {/* Preview Table */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-[11px] text-[var(--text-tertiary)] font-mono">
                      <span>Field Definitions Preview (Showing first {parsedData.preview.length} of {parsedData.total_fields})</span>
                      <span className="text-emerald-500 font-bold">✓ Standard Format Verified</span>
                    </div>
                    <div className="rounded-xl border border-[var(--border)] overflow-hidden max-h-56 overflow-y-auto">
                      <table className="w-full text-left text-[11px] font-mono">
                        <thead className="bg-[var(--bg-tertiary)] text-[var(--text-tertiary)] uppercase text-[9.5px] sticky top-0 border-b border-[var(--border)]">
                          <tr>
                            <th className="py-2 px-3">SAP Structure</th>
                            <th className="py-2 px-3">Field Name</th>
                            <th className="py-2 px-3">Description</th>
                            <th className="py-2 px-3">Type</th>
                            <th className="py-2 px-3">Length</th>
                            <th className="py-2 px-3">Mandatory</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--border)] text-[var(--text-secondary)]">
                          {parsedData.preview.map((f, i) => (
                            <tr key={i} className="hover:bg-[var(--bg-tertiary)]/40">
                              <td className="py-1.5 px-3 text-teal-600 dark:text-teal-400 font-semibold">{f.sap_structure}</td>
                              <td className="py-1.5 px-3 font-bold text-[var(--text-primary)]">{f.field_name}</td>
                              <td className="py-1.5 px-3 text-[var(--text-secondary)] truncate max-w-[160px]">{f.field_description}</td>
                              <td className="py-1.5 px-3 text-[10px] text-indigo-400">{f.type}</td>
                              <td className="py-1.5 px-3 text-[10px] text-[var(--text-tertiary)]">{f.length || '—'}</td>
                              <td className="py-1.5 px-3">
                                <Badge variant={f.is_mandatory ? 'red' : 'neutral'}>
                                  {f.is_mandatory ? 'REQUIRED' : 'OPTIONAL'}
                                </Badge>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-between px-6 py-4 border-t border-[var(--border)] bg-[var(--bg-tertiary)]/40">
              {step === 'preview' ? (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={<RotateCcw className="w-3.5 h-3.5" />}
                    onClick={() => {
                      setStep('upload');
                      setValidationError(null);
                    }}
                    disabled={isImporting}
                  >
                    Back to Upload
                  </Button>
                  <div className="flex items-center gap-2">
                    <Button variant="secondary" size="sm" onClick={handleClose} disabled={isImporting}>
                      Cancel
                    </Button>
                    <Button
                      variant="primary"
                      size="sm"
                      icon={isImporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                      onClick={handleConfirmImport}
                      disabled={isImporting || !targetObjectName.trim()}
                    >
                      {isImporting ? 'Importing Fields...' : 'Confirm & Import to Target Objects'}
                    </Button>
                  </div>
                </>
              ) : (
                <div className="w-full flex justify-end">
                  <Button variant="secondary" size="sm" onClick={handleClose} disabled={isUploading}>
                    Cancel
                  </Button>
                </div>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
