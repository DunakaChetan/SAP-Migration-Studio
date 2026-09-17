import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMigration } from '@/store/migration-store';
import { useToast } from '@/components/ui/toast';
import { useLoading } from '@/components/ui/loading-overlay';
import { dl, expCSV } from '@/lib/utils';
import { jsPDF } from 'jspdf';
import {
  PageLayout, PageGrid, GridCol, Card, CardHeader, CardBody, Button,
  StatBox, StatsGrid, DataTable, PageHeader, EmptyState,
  DynamicTransformModal
} from '@/components/shared';
import {
  ArrowLeft, ArrowRight, Cog, Download, Upload, FileText, Search,
  ChevronDown, ChevronUp, ChevronLeft, ChevronRight, FileSpreadsheet,
  Save, Check, Bot, Sparkles, X, Trash2, Pencil, Plus, Layers,
  ListFilter, CheckSquare, Square, RotateCcw
} from 'lucide-react';
import { TableFilterToolbar, filterRowsByKey, detectKeyColumns, getTableDisplayData } from '@/components/shared/TableFilterToolbar';
import type { TableInfo } from '@/components/shared/TableFilterToolbar';
import { TablePaginationFooter } from '@/components/shared/TablePaginationFooter';

export interface TransformRuleItem {
  id: string;
  field: string;
  source?: string;
  description?: string;
  enabled?: boolean;
  active?: boolean;
  rule_type?: string;
  action?: string;
  operation?: string;
  param?: string;
  newValue?: string;
  prefix?: string;
  suffix?: string;
  prompt?: string;
  pythonCode?: string;
  python_code?: string;
  rowIndex?: number;
  rowNumber?: number;
  scope?: string;
  Source_Field?: string;
  Source_Data?: string;
  Target_Data?: string;
  source_data?: string;
  target_data?: string;
  oldValue?: string;
  file_name?: string;
}

const AUDIT_PAGE_SIZE = 15;

/* ─── Target Table Resolver (Returns ALL matching SAP structure tables for a field) ─── */
function resolveTargetTables(fieldName: string, extractedTables: TableInfo[] = [], targetObject?: string): string[] {
  if (!fieldName) return ['General'];
  const cleanField = fieldName.replace(/^\[\d+\]\s*/, '').trim();
  const fieldBase = cleanField.split('.').pop() || cleanField;
  const fieldLower = fieldBase.toLowerCase();

  const matchedTables: string[] = [];

  for (const t of extractedTables) {
    for (const col of t.columns) {
      const cleanCol = col.replace(/^\[\d+\]\s*/, '').trim();
      const colBase = cleanCol.split('.').pop() || cleanCol;
      if (colBase.toLowerCase() === fieldLower || cleanCol.toLowerCase() === cleanField.toLowerCase()) {
        if (!matchedTables.includes(t.table_name)) {
          matchedTables.push(t.table_name);
        }
      }
    }
  }

  if (matchedTables.length > 0) {
    return matchedTables;
  }

  // Fallback heuristics based on field names if not explicitly found in extractedTables schema
  if (fieldLower.includes('addr') || fieldLower.includes('city') || fieldLower.includes('country') || fieldLower.includes('street') || fieldLower.includes('post_code') || fieldLower.includes('telnr') || fieldLower.includes('smtp')) {
    return ['S_ADDRESS'];
  }
  if (fieldLower.includes('company') || fieldLower.includes('bukrs') || fieldLower.includes('akont')) {
    return ['S_CUST_COMPANY'];
  }
  if (fieldLower.includes('sales') || fieldLower.includes('vkorg') || fieldLower.includes('vtweg') || fieldLower.includes('spart')) {
    return ['S_CUST_SALES'];
  }
  if (fieldLower.includes('tax') || fieldLower.includes('stcd') || fieldLower.includes('vat')) {
    return ['S_CUST_TAXNUMBERS'];
  }

  const objName = (targetObject || 'CUST').toUpperCase();
  return [`S_${objName}_GEN`];
}

/* ─── Transformation Report Card (Matching Harmonization Report Card Aesthetic) ─── */
function TransformationReportCard({
  summary,
  transformedRows,
  extractedTables = [],
  targetObject,
}: {
  summary: any;
  transformedRows: any[];
  extractedTables?: TableInfo[];
  targetObject?: string;
}) {
  const [showLogDetails, setShowLogDetails] = useState(false);
  const [auditSearch, setAuditSearch] = useState('');
  const [auditPage, setAuditPage] = useState(1);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const { toast } = useToast();

  const rawAuditLog: any[] = summary?.audit_log || [];
  const rowsLoaded = summary?.rows_loaded || transformedRows.length || 0;
  const rowsModified = summary?.rows_modified || 0;
  const rulesParsed = summary?.mapping_rules_parsed || 0;

  // Expand audit log entries across ALL target SAP tables containing each transformed field
  const expandedAuditLog: any[] = [];
  rawAuditLog.forEach((item: any) => {
    const fld = item.field || 'General';
    const targetTables = item.table_name
      ? [item.table_name]
      : resolveTargetTables(fld, extractedTables, targetObject);

    targetTables.forEach((tbl) => {
      expandedAuditLog.push({
        ...item,
        target_table: tbl,
      });
    });
  });

  const totalModifications = summary?.total_modifications || rawAuditLog.length || 0;

  // Group audit log by target table & field name
  const fieldGroups: Record<string, { tableName: string; field: string; items: any[] }> = {};
  expandedAuditLog.forEach((item) => {
    const tblName = item.target_table;
    const fld = item.field;
    const key = `${tblName}.${fld}`;
    if (!fieldGroups[key]) {
      fieldGroups[key] = { tableName: tblName, field: fld, items: [] };
    }
    fieldGroups[key].items.push(item);
  });

  const uniqueFieldsCount = Object.keys(fieldGroups).length;

  // Filtered audit log entries
  const filteredAuditLog = expandedAuditLog.filter((item: any) => {
    if (!auditSearch) return true;
    const s = auditSearch.toLowerCase();
    return (
      item.field?.toLowerCase().includes(s) ||
      item.target_table?.toLowerCase().includes(s) ||
      item.old_value?.toLowerCase().includes(s) ||
      item.new_value?.toLowerCase().includes(s) ||
      String(item.row).includes(s)
    );
  });

  const exportTransformCSV = () => {
    try {
      const getPkInfo = (rowIndex: number) => {
        const rowObj = transformedRows[rowIndex - 1] || transformedRows[rowIndex];
        if (!rowObj) return { pkField: 'Row', pkValue: `#${rowIndex}` };
        const fallbackKeys = ['KUNNR', 'CUSTOMER_ID', 'LIFNR', 'VENDOR_ID', 'MATNR', 'MATERIAL_ID'];
        for (const fk of fallbackKeys) {
          if (rowObj[fk] !== undefined && rowObj[fk] !== null && String(rowObj[fk]).trim() !== '') {
            return { pkField: fk, pkValue: rowObj[fk] };
          }
        }
        return { pkField: 'Row', pkValue: `#${rowIndex}` };
      };

      const csvLines = ['Index,Target_Table,Field_Name,Row_Index,PK_Field,PK_Value,Original_Value,Transformed_Value'];
      expandedAuditLog.forEach((item: any, idx: number) => {
        const pk = getPkInfo(item.row || 1);
        const safeTable = (item.target_table || '').replace(/"/g, '""');
        const safeField = (item.field || '').replace(/"/g, '""');
        const safeOld = `"${(item.old_value || '').toString().replace(/"/g, '""')}"`;
        const safeNew = `"${(item.new_value || '').toString().replace(/"/g, '""')}"`;
        csvLines.push(`${idx + 1},"${safeTable}","${safeField}",${item.row || 'N/A'},"${pk.pkField}","${pk.pkValue}",${safeOld},${safeNew}`);
      });
      dl(csvLines.join('\n'), `Transformation_Audit_${targetObject || 'Data'}.csv`, 'text/csv');
      toast('Transformation Report CSV exported successfully!', 'ok');
    } catch (err: any) {
      toast('Failed to export CSV', 'err');
    }
  };

  const exportTransformPDF = () => {
    try {
      const getPkInfo = (rowIndex: number) => {
        const rowObj = transformedRows[rowIndex - 1] || transformedRows[rowIndex];
        if (!rowObj) return { pkField: 'Row', pkValue: `#${rowIndex}` };
        const fallbackKeys = ['KUNNR', 'CUSTOMER_ID', 'LIFNR', 'VENDOR_ID', 'MATNR', 'MATERIAL_ID'];
        for (const fk of fallbackKeys) {
          if (rowObj[fk] !== undefined && rowObj[fk] !== null && String(rowObj[fk]).trim() !== '') {
            return { pkField: fk, pkValue: rowObj[fk] };
          }
        }
        return { pkField: 'Row', pkValue: `#${rowIndex}` };
      };

      const doc = new jsPDF('p', 'mm', 'a4');
      const pageWidth = doc.internal.pageSize.getWidth();
      let yPos = 20;

      const primaryColor = [124, 58, 237]; // Violet for transform
      const darkText = [30, 41, 59];
      const mutedText = [100, 116, 139];
      const lightBg = [248, 250, 252];
      const tableHeaderBg = [241, 245, 249];
      const tableAltRowBg = [248, 250, 252];

      // Header Banner
      doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
      doc.rect(0, 0, pageWidth, 28, 'F');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(16);
      doc.setTextColor(255, 255, 255);
      doc.text('SAP Migration Studio — Transformation Audit Report', 14, 14);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.text(`Generated: ${new Date().toLocaleDateString()} | Target Object: ${targetObject || 'Data'} | ${rowsLoaded} Records`, 14, 22);

      yPos = 36;

      // Executive Title
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(14);
      doc.setTextColor(darkText[0], darkText[1], darkText[2]);
      doc.text(`Transformation Intelligence Report: ${targetObject || 'Master'} Data`, 14, yPos);
      yPos += 8;

      // Scorecard Box
      doc.setFillColor(lightBg[0], lightBg[1], lightBg[2]);
      doc.roundedRect(14, yPos, pageWidth - 28, 22, 3, 3, 'F');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
      doc.text(`Transformation Impact Overview`, 20, yPos + 9);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(100, 116, 139);
      const modPct = rowsLoaded > 0 ? ((rowsModified / rowsLoaded) * 100).toFixed(1) : '0.0';
      doc.text(`Total Records: ${rowsLoaded}  |  Rows Modified: ${rowsModified} (${modPct}%)  |  Total Replacements: ${totalModifications}  |  Mapping Rules Active: ${rulesParsed}`, 20, yPos + 16);

      yPos += 30;

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.setTextColor(darkText[0], darkText[1], darkText[2]);
      doc.text('1. Detailed Transformation Registry (Row-Level Audit)', 14, yPos);
      yPos += 8;

      doc.setFillColor(tableHeaderBg[0], tableHeaderBg[1], tableHeaderBg[2]);
      doc.rect(14, yPos, pageWidth - 28, 6.5, 'F');
      doc.setFontSize(8);
      doc.setTextColor(71, 85, 105);
      doc.text('Row', 16, yPos + 4.5);
      doc.text('Primary Key', 28, yPos + 4.5);
      doc.text('Table', 65, yPos + 4.5);
      doc.text('Field', 95, yPos + 4.5);
      doc.text('Old Value', 125, yPos + 4.5);
      doc.text('New Value', 165, yPos + 4.5);
      yPos += 6.5;

      doc.setFont('helvetica', 'normal');
      expandedAuditLog.slice(0, 150).forEach((item: any, idx: number) => {
        if (yPos > 275) { doc.addPage(); yPos = 20; }
        if (idx % 2 === 1) {
          doc.setFillColor(tableAltRowBg[0], tableAltRowBg[1], tableAltRowBg[2]);
          doc.rect(14, yPos, pageWidth - 28, 5.5, 'F');
        }

        const pk = getPkInfo(item.row || 1);

        doc.setTextColor(darkText[0], darkText[1], darkText[2]);
        doc.text(String(item.row), 16, yPos + 4);
        doc.text(String(pk.pkValue || pk.pkField).substring(0, 20), 28, yPos + 4);
        doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
        doc.text(String(item.target_table).substring(0, 15), 65, yPos + 4);
        doc.setTextColor(darkText[0], darkText[1], darkText[2]);
        doc.text(String(item.field).substring(0, 15), 95, yPos + 4);
        doc.setTextColor(239, 68, 68); // Red
        doc.text(String(item.old_value || '(empty)').substring(0, 20), 125, yPos + 4);
        doc.setTextColor(16, 185, 129); // Emerald
        doc.text(String(item.new_value || '').substring(0, 20), 165, yPos + 4);

        yPos += 5.5;
      });

      if (expandedAuditLog.length > 150) {
        doc.setFontSize(7);
        doc.setTextColor(mutedText[0], mutedText[1], mutedText[2]);
        doc.text(`... and ${expandedAuditLog.length - 150} more transformations (Full dataset available in exported CSV)`, 18, yPos + 4);
      }

      doc.save(`Transformation_Audit_Report_${targetObject || 'Data'}.pdf`);
      toast('Transformation PDF Report exported successfully!', 'ok');
    } catch (err: any) {
      toast('Failed to generate PDF', 'err');
    }
  };

  return (
    <Card className="mb-6 border-violet-200 dark:border-violet-900/40 bg-gradient-to-br from-[var(--bg-primary)] via-[var(--bg-secondary)] to-violet-50/20 dark:to-violet-950/10 shadow-sm">
      <CardHeader
        title="Transformation Changes & Audit Report"
        subtitle="Executive summary of value replacements, target SAP table mappings, and complete audit trail"
        icon={<FileText className="w-4 h-4 text-violet-600 dark:text-violet-400" />}
      >
        <div className="ml-auto flex items-center gap-2">
          <>
            <Button variant="secondary" size="sm" icon={<Download className="w-3.5 h-3.5 text-indigo-500" />} onClick={exportTransformPDF}>
              Export Vector PDF
            </Button>
            <Button variant="secondary" size="sm" icon={<FileSpreadsheet className="w-3.5 h-3.5 text-emerald-500" />} onClick={exportTransformCSV}>
              Export CSV
            </Button>
          </>
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-tertiary)] hover:bg-[var(--bg-secondary)] text-[11px] font-bold text-[var(--text-secondary)] transition-colors cursor-pointer"
          >
            {isCollapsed ? (
              <>
                <ChevronDown className="w-3.5 h-3.5 text-violet-500" />
                <span>Expand Audit Report</span>
              </>
            ) : (
              <>
                <ChevronUp className="w-3.5 h-3.5 text-violet-500" />
                <span>Collapse Audit Report</span>
              </>
            )}
          </button>
        </div>
      </CardHeader>
      {!isCollapsed && (
        <CardBody className="p-4 space-y-4">
          {/* Metric Cards Grid */}
          <div className="grid grid-cols-4 gap-3">
            <div className="p-3 rounded-xl border border-[var(--border)] bg-[var(--bg-tertiary)]/50">
              <div className="text-[10px] font-bold text-[var(--text-tertiary)] uppercase tracking-wider">Rows Modified</div>
              <div className="mt-1 flex items-baseline gap-1.5">
                <span className="text-xl font-extrabold text-[var(--text-primary)]">{rowsModified}</span>
                <span className="text-[10px] text-[var(--text-tertiary)]">/ {rowsLoaded} total</span>
              </div>
              <div className="mt-1 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                {rowsModified > 0 ? `${((rowsModified / (rowsLoaded || 1)) * 100).toFixed(0)}% records transformed` : 'No records altered'}
              </div>
            </div>

            <div className="p-3 rounded-xl border border-[var(--border)] bg-[var(--bg-tertiary)]/50">
              <div className="text-[10px] font-bold text-[var(--text-tertiary)] uppercase tracking-wider">Total Replacements</div>
              <div className="mt-1 flex items-baseline gap-1.5">
                <span className="text-xl font-extrabold text-violet-600 dark:text-violet-400">{totalModifications}</span>
                <span className="text-[10px] text-[var(--text-tertiary)]">cell edits</span>
              </div>
              <div className="mt-1 text-[10px] font-semibold text-violet-600/80 dark:text-violet-400/80">
                Across {uniqueFieldsCount} target fields
              </div>
            </div>

            <div className="p-3 rounded-xl border border-[var(--border)] bg-[var(--bg-tertiary)]/50">
              <div className="text-[10px] font-bold text-[var(--text-tertiary)] uppercase tracking-wider">Rules Parsed</div>
              <div className="mt-1 flex items-baseline gap-1.5">
                <span className="text-xl font-extrabold text-[var(--text-primary)]">{rulesParsed}</span>
                <span className="text-[10px] text-[var(--text-tertiary)]">mapping rules</span>
              </div>
              <div className="mt-1 text-[10px] font-semibold text-cyan-600 dark:text-cyan-400">
                {summary?.ai_rules?.length ? 'AI natural language active' : 'File rules applied'}
              </div>
            </div>

            <div className="p-3 rounded-xl border border-[var(--border)] bg-[var(--bg-tertiary)]/50">
              <div className="text-[10px] font-bold text-[var(--text-tertiary)] uppercase tracking-wider">Fields Transformed</div>
              <div className="mt-1.5 flex flex-wrap gap-1 max-h-[45px] overflow-y-auto scrollbar-thin">
                {Object.keys(fieldGroups).length > 0 ? (
                  Object.entries(fieldGroups).slice(0, 6).map(([key, grp]) => (
                    <span key={key} className="px-2 py-0.5 rounded-md bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 font-mono font-bold text-[10px]">
                      {grp.tableName}.{grp.field}: {grp.items.length}
                    </span>
                  ))
                ) : (
                  <span className="text-[10px] text-[var(--text-tertiary)] italic">No fields</span>
                )}
              </div>
            </div>
          </div>

          {/* Transformation Breakdown by Target Table & Field Grid */}
          {Object.keys(fieldGroups).length > 0 && (
            <div className="space-y-2">
              <div className="text-[11.5px] font-bold text-[var(--text-primary)]">
                Transformation Breakdown by Target Table & Field
              </div>
              <div className="grid grid-cols-2 gap-3">
                {Object.entries(fieldGroups).slice(0, 4).map(([key, grp], i) => (
                  <div key={i} className="p-3 rounded-xl border border-[var(--border)] bg-[var(--bg-tertiary)]/40 space-y-1.5">
                    <div className="flex items-center justify-between text-[11px] font-bold text-[var(--text-primary)]">
                      <span className="flex items-center gap-1.5 min-w-0">
                        <span>⚡</span>
                        <span className="font-mono text-purple-600 dark:text-purple-400 font-extrabold truncate">{grp.tableName}</span>
                        <span className="text-[var(--text-tertiary)]">.</span>
                        <span className="font-mono text-violet-600 dark:text-violet-400 truncate">{grp.field}</span>
                      </span>
                      <span className="px-1.5 py-0.5 rounded bg-[var(--bg-tertiary)] text-[9.5px] font-bold text-violet-600 dark:text-violet-400 border border-[var(--border)] shrink-0">
                        {grp.items.length} events
                      </span>
                    </div>
                    <div className="space-y-1 max-h-[100px] overflow-y-auto scrollbar-thin pr-1">
                      {(() => {
                        const uniqueMappings = new Map();
                        grp.items.forEach(item => {
                          const key = `${item.old_value}::${item.new_value}`;
                          if (!uniqueMappings.has(key)) {
                            uniqueMappings.set(key, { old_val: item.old_value, new_val: item.new_value, count: 1 });
                          } else {
                            uniqueMappings.get(key).count++;
                          }
                        });
                        return Array.from(uniqueMappings.values()).slice(0, 20).map((item, idx) => (
                          <div key={idx} className="text-[10px] text-[var(--text-secondary)] font-mono truncate bg-[var(--bg-primary)]/50 px-2 py-0.5 rounded flex items-center justify-between gap-1">
                            <span className="flex items-center gap-1 min-w-0">
                              <span className="text-red-500 line-through truncate max-w-[100px]">{item.old_val || '(empty)'}</span>
                              <span className="text-[var(--text-tertiary)]">→</span>
                              <span className="text-emerald-500 font-bold truncate max-w-[100px]">{item.new_val}</span>
                            </span>
                            <span className="text-[9px] font-bold text-[var(--text-tertiary)] bg-[var(--bg-tertiary)] px-1 rounded shrink-0">x{item.count}</span>
                          </div>
                        ));
                      })()}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Expandable Complete Audit Trail */}
          <div className="pt-2 border-t border-[var(--border)] flex items-center justify-between">
            <button
              onClick={() => setShowLogDetails(!showLogDetails)}
              className="text-[11px] font-bold text-violet-600 dark:text-violet-400 hover:underline flex items-center gap-1 cursor-pointer"
            >
              {showLogDetails ? '▼ Hide Complete Audit Trail' : '▶ View Complete Audit Trail'} ({expandedAuditLog.length} logged replacements across target tables)
            </button>
          </div>

          {showLogDetails && (
            <div className="space-y-3 pt-2">
              <div className="flex items-center gap-2 p-2 rounded-xl bg-[var(--bg-tertiary)]/50 border border-[var(--border)]">
                <div className="relative w-full">
                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" />
                  <input
                    type="text"
                    value={auditSearch}
                    onChange={(e) => { setAuditSearch(e.target.value); setAuditPage(1); }}
                    placeholder="Search audit log by target table, field, old value, or new value..."
                    className="w-full text-[11px] pl-8 pr-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-violet-500"
                  />
                </div>
              </div>

              {filteredAuditLog.length === 0 ? (
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
                        <th className="py-2.5 px-3">Target SAP Table</th>
                        <th className="py-2.5 px-3">Field Name</th>
                        <th className="py-2.5 px-3">Transformation (Before → After)</th>
                        <th className="py-2.5 px-3 text-right">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border)] text-[10.5px] font-mono">
                      {filteredAuditLog.slice((auditPage - 1) * AUDIT_PAGE_SIZE, auditPage * AUDIT_PAGE_SIZE).map((item: any, idx: number) => {
                        return (
                          <tr key={item.id ? `${item.id}_${item.target_table}_${idx}` : idx} className="hover:bg-[var(--bg-tertiary)]/40 transition-colors">
                            <td className="py-2 px-3 font-bold text-[var(--text-secondary)]">#{item.row}</td>
                            <td className="py-2 px-3">
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300">
                                {item.phase || 'Transform'}
                              </span>
                            </td>
                            <td className="py-2 px-3">
                              <span className="px-2 py-0.5 rounded text-[9.5px] font-bold font-mono bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 border border-purple-300 dark:border-purple-800">
                                {item.target_table}
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
                        );
                      })}
                    </tbody>
                  </table>

                  {/* Audit Log Pagination Footer */}
                  <TablePaginationFooter
                    currentPage={auditPage}
                    totalRows={filteredAuditLog.length}
                    pageSize={AUDIT_PAGE_SIZE}
                    onPageChange={setAuditPage}
                    isFiltered={!!auditSearch}
                    accentColor="violet"
                  />
                </div>
              )}
            </div>
          )}
        </CardBody>
      )}
    </Card>
  );
}

export function Step7Transform() {
  const { state, dispatch } = useMigration();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { showLoad, hideLoad } = useLoading();

  const [mappingFile, setMappingFile] = useState<File | null>(null);
  const [aiPrompt, setAiPrompt] = useState('');

  // Active Transformation Rules State
  const [rules, setRules] = useState<TransformRuleItem[]>([]);
  const [isApplyingBatch, setIsApplyingBatch] = useState(false);
  const [isMappingRulesExpanded, setIsMappingRulesExpanded] = useState(false);

  // Dynamic Transform Modal State
  const [dynamicModalState, setDynamicModalState] = useState<{
    isOpen: boolean;
    tableName: string;
    allFields: string[];
    initialField?: string;
    initialValue?: string;
    rowIndex?: number;
    rowNumber?: number;
  }>({
    isOpen: false,
    tableName: '',
    allFields: [],
    initialField: '',
    initialValue: '',
    rowIndex: undefined,
    rowNumber: undefined
  });

  const summary = state.transformSummary;
  const transformedRows = state.transformed || [];
  const has = transformedRows.length > 0;

  // Table filter state for output display
  const [selectedOutputTables, setSelectedOutputTables] = useState<Set<string>>(new Set());
  const [outputKeyFilter, setOutputKeyFilter] = useState('');
  const [tablePages, setTablePages] = useState<Record<string, number>>({});
  const [openPreviewAccordion, setOpenPreviewAccordion] = useState(true);
  const extractedTables = state.extractedTables || [];

  // Partition rules into mapping sheet rules and dynamic rules
  const mappingRules = rules.filter(r => r.source === 'file' || r.rule_type === 'mapping_sheet');
  const dynamicRules = rules.filter(r => r.source !== 'file' && r.rule_type !== 'mapping_sheet');
  const isMappingAllActive = mappingRules.length > 0 && mappingRules.every(r => (r.active !== false && r.enabled !== false));
  const mappingActiveCount = mappingRules.filter(r => (r.active !== false && r.enabled !== false)).length;

  // Initialize selectedOutputTables when extractedTables are available
  useEffect(() => {
    if (extractedTables.length > 0) {
      setSelectedOutputTables(new Set(extractedTables.map((t: any) => t.table_name)));
    }
  }, [extractedTables.length]);

  // Compute all available unique fields across extractedTables, cleaned rows, and transformed rows
  const allAvailableFields = useMemo(() => {
    const fieldSet = new Set<string>();
    if (extractedTables && extractedTables.length > 0) {
      extractedTables.forEach((t: any) => {
        (t.columns || []).forEach((c: string) => fieldSet.add(c));
      });
    }
    if (state.cleaned && state.cleaned.length > 0) {
      Object.keys(state.cleaned[0]).forEach((c) => fieldSet.add(c));
    } else if (state.transformed && state.transformed.length > 0) {
      Object.keys(state.transformed[0]).forEach((c) => fieldSet.add(c));
    }
    return Array.from(fieldSet);
  }, [extractedTables, state.cleaned, state.transformed]);

  // Load saved transformation rules on mount (matching Step 4, Step 5, Step 6 pattern)
  useEffect(() => {
    if (state.projectId && state.obj) {
      const fetchSavedRules = async () => {
        try {
          const res = await fetch(
            `${import.meta.env.VITE_BACKEND_URL || ''}/api/validate/rules?project_id=${state.projectId}&target_object=${encodeURIComponent(state.obj)}&source=transform`
          );
          if (res.ok) {
            const data = await res.json();
            if (data.rules && Array.isArray(data.rules) && data.rules.length > 0) {
              const loadedRules: TransformRuleItem[] = data.rules.map((r: any) => ({
                id: r.id || crypto.randomUUID(),
                field: r.field || r.target_field || r.Source_Field || 'Field',
                source: r.source || (r.Source_Field || r.rule_type === 'mapping_sheet' ? 'file' : 'preset'),
                description: r.description || r.prompt || '',
                enabled: r.enabled !== undefined ? r.enabled : (r.active !== undefined ? r.active : true),
                active: r.active !== undefined ? r.active : (r.enabled !== undefined ? r.enabled : true),
                rule_type: r.rule_type || (r.source === 'file' ? 'mapping_sheet' : (r.source === 'nlp' || r.pythonCode || r.python_code ? 'ai' : 'preset')),
                action: r.action || r.operation || 'upper',
                operation: r.operation || r.action || 'upper',
                param: r.param || r.newValue || r.prefix || r.suffix || '',
                newValue: r.newValue || r.param || r.Target_Data || '',
                oldValue: r.oldValue || r.Source_Data || '',
                Source_Field: r.Source_Field || r.field,
                Source_Data: r.Source_Data || r.oldValue || r.source_data,
                Target_Data: r.Target_Data || r.newValue || r.target_data,
                source_data: r.source_data || r.Source_Data || r.oldValue,
                target_data: r.target_data || r.Target_Data || r.newValue,
                file_name: r.file_name || '',
                prefix: r.prefix || '',
                suffix: r.suffix || '',
                prompt: r.prompt || r.description || '',
                pythonCode: r.pythonCode || r.python_code || '',
                python_code: r.python_code || r.pythonCode || ''
              }));
              setRules(loadedRules);
            }
          }
        } catch (e) {
          console.error('Failed to fetch saved transformation rules', e);
        }
      };
      fetchSavedRules();
    }
  }, [state.projectId, state.obj]);

  // Persist rules to backend database via /api/validate/rules/save
  const persistRules = async (rulesToSave: TransformRuleItem[]) => {
    if (!state.projectId || !state.obj) return;
    try {
      await fetch(`${import.meta.env.VITE_BACKEND_URL}/api/validate/rules/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: state.projectId,
          target_object: state.obj,
          source: 'transform',
          mock_cycle: state.activeMock || 'mock-0',
          rules: rulesToSave.map(r => ({
            ...r,
            enabled: r.active ?? r.enabled ?? true,
            active: r.active ?? r.enabled ?? true,
            operation: r.action || r.operation
          }))
        })
      });
    } catch (e) {
      console.error('Failed to persist rules to database:', e);
    }
  };

  // Execute rules batch in real-time on Python FastAPI engine
  const applyRulesBatch = async (rulesToApply: TransformRuleItem[]) => {
    if (!state.projectId) return;

    const activeRules = rulesToApply.filter(r => (r.active !== false && r.enabled !== false));
    const baseData = (state.cleaned && state.cleaned.length > 0)
      ? state.cleaned
      : ((state.transformed && state.transformed.length > 0) ? state.transformed : []);

    if (activeRules.length === 0) {
      // Revert to clean baseline when all rules are disabled or cleared
      dispatch({ type: 'SET_FIELD', field: 'transformed', value: baseData });
      dispatch({
        type: 'SET_FIELD',
        field: 'transformSummary',
        value: {
          rows_loaded: baseData.length,
          rows_modified: 0,
          total_modifications: 0,
          mapping_rules_parsed: 0,
          table_breakdowns: {},
          audit_log: []
        }
      });
      dispatch({ type: 'SET_FIELD', field: 'isTransformedSaved', value: false });
      return;
    }

    setIsApplyingBatch(true);
    showLoad('Applying Transformations...', `Executing ${activeRules.length} active rule(s) in real-time...`);

    try {
      const res = await fetch(`${import.meta.env.VITE_BACKEND_URL}/api/sap/transform/apply-batch-rules`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: state.projectId,
          target_object: state.obj,
          mock_cycle: state.activeMock || 'mock-0',
          rules: activeRules.map(r => ({
            ...r,
            enabled: true,
            active: true,
            operation: r.action || r.operation
          })),
          fallback_data: baseData
        })
      });

      if (!res.ok) {
        const errDetail = await res.text();
        throw new Error(errDetail);
      }

      const data = await res.json();
      dispatch({ type: 'SET_FIELD', field: 'transformed', value: data.data });
      dispatch({ type: 'SET_FIELD', field: 'transformSummary', value: data.summary });
      dispatch({ type: 'SET_FIELD', field: 'isTransformedSaved', value: false });
      toast(`Applied ${activeRules.length} transformation rule(s) successfully!`, 'ok');
    } catch (err: any) {
      console.error('Batch transform error:', err);
      toast(`Transform error: ${err.message}`, 'err');
    } finally {
      setIsApplyingBatch(false);
      hideLoad();
    }
  };

  // Rule management handlers
  const toggleRule = async (id: string) => {
    const updated = rules.map(r => {
      if (r.id === id) {
        const nextActive = !((r.active !== undefined) ? r.active : r.enabled);
        return { ...r, active: nextActive, enabled: nextActive };
      }
      return r;
    });
    setRules(updated);
    await persistRules(updated);
    await applyRulesBatch(updated);
  };

  const toggleAllRules = async (active: boolean) => {
    const updated = rules.map(r => ({ ...r, active, enabled: active }));
    setRules(updated);
    await persistRules(updated);
    await applyRulesBatch(updated);
  };

  const clearAllRules = async () => {
    setRules([]);
    await persistRules([]);
    await applyRulesBatch([]);
    toast('All transformation rules cleared.', 'ok');
  };

  const deleteRule = async (id: string) => {
    const updated = rules.filter(r => r.id !== id);
    setRules(updated);
    await persistRules(updated);
    await applyRulesBatch(updated);
  };

  const toggleMappingGroup = async (active: boolean) => {
    const updated = rules.map(r => {
      if (r.source === 'file' || r.rule_type === 'mapping_sheet') {
        return { ...r, active, enabled: active };
      }
      return r;
    });
    setRules(updated);
    await persistRules(updated);
    await applyRulesBatch(updated);
  };

  const deleteMappingGroup = async () => {
    const updated = rules.filter(r => r.source !== 'file' && r.rule_type !== 'mapping_sheet');
    setRules(updated);
    await persistRules(updated);
    await applyRulesBatch(updated);
    toast('Transformation mapping rules removed.', 'ok');
  };

  // Handler for rule submitted from DynamicTransformModal
  const handleApplyDynamicRule = async (ruleItem: TransformRuleItem) => {
    const standardizedRule: TransformRuleItem = {
      ...ruleItem,
      id: ruleItem.id || crypto.randomUUID(),
      enabled: true,
      active: true,
      action: ruleItem.action || ruleItem.operation || 'upper',
      operation: ruleItem.operation || ruleItem.action || 'upper',
      rule_type: ruleItem.rule_type || (ruleItem.source === 'nlp' || ruleItem.pythonCode || ruleItem.python_code ? 'ai' : 'preset'),
      param: ruleItem.param || ruleItem.newValue || ruleItem.prefix || ruleItem.suffix || '',
      prompt: ruleItem.prompt || ruleItem.description || '',
      pythonCode: ruleItem.pythonCode || ruleItem.python_code || '',
      python_code: ruleItem.python_code || ruleItem.pythonCode || ''
    };

    const updatedRules = [...rules, standardizedRule];
    setRules(updatedRules);
    setDynamicModalState(prev => ({ ...prev, isOpen: false }));
    await persistRules(updatedRules);
    await applyRulesBatch(updatedRules);
  };

  // File upload handler
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setMappingFile(e.target.files[0]);
    }
  };

  // Add mapping file rules to active rules list & execute batch (with deduplication)
  async function doTransform() {
    if (!mappingFile) {
      toast('Please upload a mapping file (CSV/Excel) first.', 'err');
      return;
    }

    showLoad('Parsing File...', 'Extracting mapping rules...');

    const formData = new FormData();
    formData.append('file', mappingFile);

    try {
      const res = await fetch(`${import.meta.env.VITE_BACKEND_URL}/api/sap/transform/parse-mapping-file`, {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        throw new Error(await res.text());
      }

      const data = await res.json();
      const parsedRules = data.rules || [];

      // Deduplication: check existing rules by Source_Field, Source_Data, and Target_Data
      const existingKeys = new Set(
        rules.map(r => {
          const f = (r.Source_Field || r.field || '').trim().toLowerCase();
          const s = (r.Source_Data || r.source_data || r.oldValue || '').trim().toLowerCase();
          const t = (r.Target_Data || r.target_data || r.newValue || '').trim().toLowerCase();
          return `${f}:::${s}:::${t}`;
        })
      );

      const newUniqueRules: TransformRuleItem[] = [];
      let duplicateCount = 0;

      for (const r of parsedRules) {
        const f = (r.Source_Field || r.field || r.Target_Field || '').trim();
        const s = (r.Source_Data || r.source_data || r.oldValue || '').trim();
        const t = (r.Target_Data || r.target_data || r.newValue || '').trim();
        const key = `${f.toLowerCase()}:::${s.toLowerCase()}:::${t.toLowerCase()}`;

        if (existingKeys.has(key)) {
          duplicateCount++;
          continue;
        }

        existingKeys.add(key);
        newUniqueRules.push({
          id: crypto.randomUUID(),
          field: f,
          rule_type: 'mapping_sheet',
          action: 'replace',
          operation: 'replace',
          source_data: s,
          target_data: t,
          oldValue: s,
          newValue: t,
          Source_Field: f,
          Source_Data: s,
          Target_Data: t,
          param: `${s || '(empty)'} → ${t}`,
          description: `Map ${f}: "${s}" → "${t}"`,
          file_name: data.filename || mappingFile.name || 'Transform_Mapping.csv',
          enabled: true,
          active: true,
          source: 'file'
        });
      }

      if (newUniqueRules.length === 0) {
        toast(`All ${parsedRules.length} mapping rule(s) already exist. No duplicate rules added.`, 'info');
        setMappingFile(null);
        return;
      }

      const updatedRules = [...rules, ...newUniqueRules];
      setRules(updatedRules);
      setMappingFile(null);
      await persistRules(updatedRules);
      await applyRulesBatch(updatedRules);

      const msg = duplicateCount > 0
        ? `Added ${newUniqueRules.length} new mapping rule(s) (${duplicateCount} duplicate(s) ignored).`
        : `Successfully parsed and applied ${newUniqueRules.length} mapping rules.`;
      toast(msg, 'ok');
    } catch (err: any) {
      toast(err.message, 'err');
    } finally {
      hideLoad();
    }
  }

  // Execute AI Natural Language transform and add to active rules
  async function doAITransform() {
    if (!aiPrompt.trim()) {
      toast('Please enter instructions for the AI.', 'err');
      return;
    }

    showLoad('AI Transforming...', 'Generating and applying Python transformation...');

    try {
      const res = await fetch(`${import.meta.env.VITE_BACKEND_URL}/api/sap/transform/ai-apply-mappings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: state.projectId,
          target_object: state.obj,
          prompt: aiPrompt,
          fallback_data: (state.cleaned && state.cleaned.length > 0) ? state.cleaned : state.transformed,
          mock_cycle: state.activeMock || 'mock-0'
        })
      });

      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();

      const pythonCode = data.python_code || data.ai_rules?.[0]?.Target_Data || data.summary?.ai_rules?.[0]?.Target_Data || '';

      const newRule: TransformRuleItem = {
        id: crypto.randomUUID(),
        field: 'Dataset',
        rule_type: 'ai',
        action: 'ai_prompt',
        prompt: aiPrompt,
        description: aiPrompt,
        python_code: pythonCode,
        pythonCode: pythonCode,
        enabled: true,
        active: true,
        source: 'ai'
      };

      const updatedRules = [...rules, newRule];
      setRules(updatedRules);
      setAiPrompt('');
      await persistRules(updatedRules);
      await applyRulesBatch(updatedRules);
    } catch (err: any) {
      toast(err.message, 'err');
    } finally {
      hideLoad();
    }
  }

  // Save transformed data to database
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
          payload: state.transformed,
          mock_cycle: state.activeMock || 'mock-0'
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

  return (
    <PageLayout>
      <PageGrid>
        <GridCol span={12}>
          <PageHeader title="Step 7 — Data Transformation" subtitle="Apply mapping sheets, quick presets, or AI prompt transformations in real-time">
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

          {/* Transformation Options & Active Rules Box */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
            <div className="col-span-1 lg:col-span-2 space-y-6">
              {/* File Upload Box */}
              <Card>
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
                        Add to Rules
                      </Button>
                    </div>
                  </div>
                </CardBody>
              </Card>

              {/* AI Chatbot Box */}
              <Card>
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
                        Generate & Run AI Transform
                      </Button>
                    </div>
                  </div>
                </CardBody>
              </Card>
            </div>

            {/* Active Transformation Rules Panel (Card 3) */}
            <Card className="h-full flex flex-col">
              <CardHeader
                title="Active Transformation Rules"
                subtitle={`${rules.filter(r => (r.active !== false && r.enabled !== false)).length} of ${rules.length} rules active`}
                icon={<ListFilter className="w-4 h-4 text-violet-500" />}
              >
                {rules.length > 0 && (
                  <div className="flex items-center gap-1 ml-auto">
                    <button
                      onClick={() => toggleAllRules(true)}
                      className="px-2 py-1 text-[10px] font-bold rounded-md border border-[var(--border)] bg-[var(--bg-tertiary)] hover:bg-[var(--bg-secondary)] text-[var(--text-secondary)] transition-colors cursor-pointer"
                      title="Enable all rules"
                    >
                      Select All
                    </button>
                    <button
                      onClick={() => toggleAllRules(false)}
                      className="px-2 py-1 text-[10px] font-bold rounded-md border border-[var(--border)] bg-[var(--bg-tertiary)] hover:bg-[var(--bg-secondary)] text-[var(--text-secondary)] transition-colors cursor-pointer"
                      title="Disable all rules"
                    >
                      Deselect All
                    </button>
                    <button
                      onClick={clearAllRules}
                      className="p-1 text-[10px] font-bold rounded-md text-red-500 hover:bg-red-500/10 transition-colors cursor-pointer"
                      title="Clear all rules"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </CardHeader>
              <CardBody className="p-0 flex-1 overflow-y-auto max-h-[460px]">
                {rules.length === 0 ? (
                  <div className="p-8 text-center text-[var(--text-tertiary)] text-xs flex flex-col items-center justify-center h-full">
                    <div className="p-3 rounded-full bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400 mb-3">
                      <Layers className="w-7 h-7 opacity-70" />
                    </div>
                    <div className="font-bold text-[var(--text-secondary)] mb-1 text-sm">No Rules Active</div>
                    <p className="text-[11px] leading-relaxed max-w-[220px]">
                      Click the <strong className="text-violet-600 dark:text-violet-400">Dynamic Transform</strong> button at bottom-right or the <strong className="text-violet-600 dark:text-violet-400">pencil edit icon</strong> beside any table column to create rules.
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-[var(--border)]">
                    {/* 1. Grouped Transformation Mapping Rules */}
                    {mappingRules.length > 0 && (
                      <div className="bg-gradient-to-r from-violet-50/40 via-transparent to-transparent dark:from-violet-950/20">
                        {/* Header Row of Mapping Group */}
                        <div className="p-3 flex items-center justify-between gap-2 hover:bg-[var(--bg-secondary)] transition-colors">
                          <div className="flex items-center gap-2 min-w-0">
                            <input
                              type="checkbox"
                              checked={isMappingAllActive}
                              onChange={(e) => toggleMappingGroup(e.target.checked)}
                              className="w-4 h-4 rounded border-[var(--border)] text-violet-600 focus:ring-violet-500 cursor-pointer"
                              title={isMappingAllActive ? "Disable all mapping rules" : "Enable all mapping rules"}
                            />
                            <div className="p-1.5 rounded-lg bg-violet-100 dark:bg-violet-900/40 text-violet-600 dark:text-violet-400 shrink-0">
                              <FileSpreadsheet className="w-3.5 h-3.5" />
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="font-bold text-xs text-[var(--text-primary)] truncate">
                                  Transformation Mapping Rules
                                </span>
                                <span className="px-1.5 py-0.5 rounded text-[9px] font-extrabold bg-violet-100 dark:bg-violet-900/50 text-violet-700 dark:text-violet-300 border border-violet-200 dark:border-violet-800 shrink-0">
                                  {mappingActiveCount}/{mappingRules.length}
                                </span>
                              </div>
                              <p className="text-[10px] text-[var(--text-tertiary)] truncate">
                                {mappingRules[0]?.file_name || 'Uploaded Mapping Sheet'} ({mappingRules.length} find & replace rules)
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            {/* Expand/Collapse Arrow Button */}
                            <button
                              type="button"
                              onClick={() => setIsMappingRulesExpanded(!isMappingRulesExpanded)}
                              className="p-1.5 rounded-md text-[var(--text-secondary)] hover:text-violet-600 hover:bg-violet-100/50 dark:hover:bg-violet-900/30 transition-colors cursor-pointer"
                              title={isMappingRulesExpanded ? "Collapse mapping rules" : "Expand mapping rules"}
                            >
                              {isMappingRulesExpanded ? (
                                <ChevronDown className="w-4 h-4 text-violet-600 dark:text-violet-400" />
                              ) : (
                                <ChevronRight className="w-4 h-4 text-violet-600 dark:text-violet-400" />
                              )}
                            </button>

                            {/* Delete All Mapping Rules Button */}
                            <button
                              type="button"
                              onClick={deleteMappingGroup}
                              className="p-1.5 rounded-md text-[var(--text-tertiary)] hover:text-red-500 hover:bg-red-500/10 transition-colors cursor-pointer"
                              title="Delete all mapping rules"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        {/* Collapsible Content: Detailed List of Individual Mapping Rules */}
                        {isMappingRulesExpanded && (
                          <div className="bg-[var(--bg-tertiary)]/40 border-t border-b border-[var(--border)] divide-y divide-[var(--border)] pl-7 pr-3 py-1">
                            {mappingRules.map((rule) => {
                              const isActive = (rule.active !== false && rule.enabled !== false);
                              return (
                                <div key={rule.id} className="py-2 flex items-center justify-between gap-2 text-xs">
                                  <div className="flex items-center gap-2 min-w-0">
                                    <input
                                      type="checkbox"
                                      checked={isActive}
                                      onChange={() => toggleRule(rule.id)}
                                      className="w-3.5 h-3.5 rounded border-[var(--border)] text-violet-600 focus:ring-violet-500 cursor-pointer"
                                    />
                                    <span className="font-mono font-bold text-violet-600 dark:text-violet-400 text-[11px] truncate max-w-[100px]" title={rule.field}>
                                      {rule.field}
                                    </span>
                                    <span className="text-[var(--text-tertiary)] text-[11px]">:</span>
                                    <span className="font-mono text-[10.5px] text-[var(--text-secondary)] truncate">
                                      <span className="text-red-500 line-through mr-1">{rule.Source_Data || rule.source_data || rule.oldValue || '(empty)'}</span>
                                      <span>→</span>
                                      <span className="text-emerald-500 font-bold ml-1">{rule.Target_Data || rule.target_data || rule.newValue}</span>
                                    </span>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => deleteRule(rule.id)}
                                    className="p-1 text-[var(--text-tertiary)] hover:text-red-500 rounded transition-colors cursor-pointer shrink-0"
                                    title="Remove mapping entry"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}

                    {/* 2. Dynamic Rules (Presets & AI) */}
                    {dynamicRules.map((rule, idx) => {
                      const isActive = (rule.active !== false && rule.enabled !== false);
                      return (
                        <div
                          key={rule.id || idx}
                          className={`p-3.5 flex items-start gap-2.5 transition-colors ${!isActive ? 'opacity-50 bg-[var(--bg-tertiary)]/20' : 'hover:bg-[var(--bg-secondary)]'}`}
                        >
                          <input
                            type="checkbox"
                            checked={isActive}
                            onChange={() => toggleRule(rule.id)}
                            className="mt-1 w-4 h-4 rounded border-[var(--border)] text-violet-600 focus:ring-violet-500 cursor-pointer"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap mb-1">
                              <span className="font-mono text-xs font-bold text-violet-600 dark:text-violet-400 truncate max-w-[130px]" title={rule.field}>
                                {rule.field}
                              </span>
                              <span className={`px-1.5 py-0.5 rounded text-[9px] font-extrabold uppercase tracking-wide ${rule.rule_type === 'ai' || rule.source === 'ai' || rule.source === 'nlp'
                                  ? 'bg-cyan-100 dark:bg-cyan-950/40 text-cyan-700 dark:text-cyan-300 border border-cyan-300 dark:border-cyan-800'
                                  : 'bg-violet-100 dark:bg-violet-950/40 text-violet-700 dark:text-violet-300 border border-violet-300 dark:border-violet-800'
                                }`}>
                                {rule.action || rule.operation || rule.rule_type || 'PRESET'}
                              </span>
                            </div>
                            {rule.prompt ? (
                              <p className="text-[11px] text-[var(--text-secondary)] line-clamp-2 italic" title={rule.prompt}>
                                "{rule.prompt}"
                              </p>
                            ) : rule.description ? (
                              <p className="text-[11px] text-[var(--text-secondary)] line-clamp-2" title={rule.description}>
                                {rule.description}
                              </p>
                            ) : rule.param ? (
                              <p className="text-[10.5px] font-mono text-[var(--text-tertiary)] truncate">
                                Param: <span className="font-bold text-[var(--text-primary)]">{rule.param}</span>
                              </p>
                            ) : null}
                          </div>
                          <button
                            onClick={() => deleteRule(rule.id)}
                            className="p-1 rounded text-[var(--text-tertiary)] hover:text-red-500 hover:bg-red-500/10 transition-colors cursor-pointer"
                            title="Delete rule"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
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
            </div>
          )}

          {/* Executive Transformation Summary Audit Report Card (Positioned ABOVE Data Preview) */}
          {summary && (
            <TransformationReportCard
              summary={summary}
              transformedRows={transformedRows}
              extractedTables={extractedTables}
              targetObject={state.obj}
            />
          )}

          {/* Transformed Data Preview — Multi-Table Display */}
          {has ? (() => {
            const allTables: TableInfo[] = extractedTables.length > 0
              ? extractedTables
              : [{ table_name: 'Transformed Output', columns: Object.keys(transformedRows[0] || {}) }];
            const visibleTables = allTables.filter((t: any) => selectedOutputTables.has(t.table_name));
            const allKeyColumns = detectKeyColumns(allTables.flatMap((t: any) => t.columns));
            const filteredRows = filterRowsByKey(transformedRows, outputKeyFilter, allKeyColumns);

            return (
              <div className="space-y-4">
                {/* Data Preview Header & Collapse Toggle */}
                <div className="flex items-center justify-between p-3 rounded-2xl border border-[var(--border)] bg-[var(--bg-secondary)] shadow-sm">
                  <div className="flex items-center gap-2">
                    <div className="p-2 rounded-xl bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400">
                      <FileSpreadsheet className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="text-xs font-extrabold text-[var(--text-primary)] uppercase tracking-wider">
                        Transformed Data Preview
                      </h3>
                      <p className="text-[10px] text-[var(--text-tertiary)]">
                        {visibleTables.length} of {allTables.length} target SAP tables displayed ({filteredRows.length} rows) — Click pencil icon on any column to transform on the spot
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={() => setOpenPreviewAccordion(!openPreviewAccordion)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-tertiary)] hover:bg-[var(--bg-primary)] text-[11px] font-bold text-[var(--text-secondary)] transition-colors cursor-pointer ml-auto"
                  >
                    {openPreviewAccordion ? (
                      <>
                        <ChevronUp className="w-3.5 h-3.5 text-violet-500" />
                        <span>Collapse Data Preview</span>
                      </>
                    ) : (
                      <>
                        <ChevronDown className="w-3.5 h-3.5 text-violet-500" />
                        <span>Expand Data Preview ({visibleTables.length} tables)</span>
                      </>
                    )}
                  </button>
                </div>

                {openPreviewAccordion && (
                  <>
                    <TableFilterToolbar
                      tables={allTables}
                      selectedTables={selectedOutputTables}
                      onSelectedTablesChange={setSelectedOutputTables}
                      keyFilterValue={outputKeyFilter}
                      onKeyFilterChange={setOutputKeyFilter}
                      keyColumns={allKeyColumns}
                      accentColor="violet"
                    />
                    {visibleTables.length === 0 ? (
                      <div className="p-8 text-center rounded-2xl border border-dashed border-gray-300 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/30 text-gray-500 dark:text-gray-400 text-xs font-medium">
                        No tables selected. Click <strong>Tables Selected</strong> above to choose tables to view.
                      </div>
                    ) : (
                      visibleTables.map((t: any) => {
                        const { columns: tableCols, rows: tableRows } = getTableDisplayData(t, filteredRows, state.mapping);
                        const currentPage = tablePages[t.table_name] || 1;
                        const paginatedRows = tableRows.slice((currentPage - 1) * 15, currentPage * 15);

                        return (
                          <Card key={t.table_name}>
                            <CardHeader
                              title={`Transformed: ${t.table_name}`}
                              subtitle={`${tableRows.length} rows × ${tableCols.length} columns${outputKeyFilter ? ' (filtered)' : ''}`}
                            >
                              <Button
                                variant="secondary"
                                size="sm"
                                icon={<Download className="w-3 h-3" />}
                                onClick={() => dl(expCSV(tableRows), `${t.table_name.replace(/[\s/]+/g, '_').toLowerCase()}_transformed.csv`, 'text/csv')}
                                className="ml-auto"
                              >
                                Export {t.table_name}
                              </Button>
                            </CardHeader>
                            <CardBody className="p-0 overflow-hidden">
                              <DataTable
                                rows={paginatedRows}
                                cols={tableCols}
                                keyCols={allKeyColumns}
                                editable={true}
                                onColumnEdit={(col) => {
                                  setDynamicModalState({
                                    isOpen: true,
                                    tableName: t.table_name,
                                    allFields: tableCols,
                                    initialField: col,
                                    initialValue: ''
                                  });
                                }}
                              />
                              <TablePaginationFooter
                                currentPage={currentPage}
                                totalRows={tableRows.length}
                                pageSize={15}
                                onPageChange={(newPage) => setTablePages(prev => ({ ...prev, [t.table_name]: newPage }))}
                                isFiltered={!!outputKeyFilter}
                                accentColor="violet"
                              />
                            </CardBody>
                          </Card>
                        );
                      })
                    )}
                  </>
                )}
              </div>
            );
          })() : (
            <Card>
              <CardBody>
                <EmptyState icon={<Cog className="w-10 h-10 text-violet-500" />} message="Upload mapping file, use Dynamic Transform, or enter AI instructions to run transformation" />
              </CardBody>
            </Card>
          )}
        </GridCol>
      </PageGrid>

      {/* Floating Quick Action Button at Bottom-Right */}
      <div className="fixed bottom-6 right-6 z-40">
        <button
          id="btn-floating-transform"
          onClick={() => {
            setDynamicModalState({
              isOpen: true,
              tableName: extractedTables.length > 0 ? extractedTables[0].table_name : 'Target Table',
              allFields: allAvailableFields,
              initialField: allAvailableFields.length > 0 ? allAvailableFields[0] : '',
              initialValue: ''
            });
          }}
          className="group relative flex items-center gap-2.5 px-4 py-3 rounded-full bg-gradient-to-r from-violet-600 via-indigo-600 to-purple-600 text-white font-bold text-xs shadow-lg shadow-violet-500/30 hover:shadow-xl hover:shadow-violet-500/50 hover:scale-105 active:scale-95 transition-all duration-200 cursor-pointer border border-violet-400/30"
          title="Open Dynamic Transformation"
        >
          <div className="p-1 rounded-full bg-white/20">
            <Sparkles className="w-3.5 h-3.5 text-white animate-pulse" />
          </div>
          <span>Dynamic Transform</span>
          <span className="px-1.5 py-0.5 rounded-full bg-white/20 text-[10px] font-extrabold">
            {rules.filter(r => (r.active !== false && r.enabled !== false)).length}
          </span>
        </button>
      </div>

      {/* Dynamic Transform Modal */}
      <DynamicTransformModal
        isOpen={dynamicModalState.isOpen}
        onClose={() => setDynamicModalState(prev => ({ ...prev, isOpen: false }))}
        onRunTransform={handleApplyDynamicRule}
        tableName={dynamicModalState.tableName}
        allFields={dynamicModalState.allFields.length > 0 ? dynamicModalState.allFields : allAvailableFields}
        initialField={dynamicModalState.initialField}
        initialValue={dynamicModalState.initialValue}
        targetObject={state.obj}
        projectId={state.projectId}
        currentRows={state.cleaned && state.cleaned.length > 0 ? state.cleaned : state.transformed}
      />
    </PageLayout>
  );
}
