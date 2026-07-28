import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMigration } from '@/store/migration-store';
import { useToast } from '@/components/ui/toast';
import { useLoading } from '@/components/ui/loading-overlay';
import { OBJS } from '@/data/sap-schemas';
import { TRANSFORMS } from '@/data/lookup-maps';
import { ai, parseAI } from '@/services/ai-service';
import { dl, expCSV } from '@/lib/utils';
import { cn } from '@/lib/utils';
import { PageLayout, PageGrid, GridCol, Card, CardHeader, CardBody, Button, Badge, StatBox, StatsGrid, PageHeader, Divider, EmptyState, AIResponse, Select } from '@/components/shared';
import { ArrowLeft, ArrowRight, Bot, Download, X } from 'lucide-react';
import type { MappingEntry } from '@/store/migration-store';

export function Step2AIMapping() {
  const { state, dispatch } = useMigration();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { showLoad, tick, hideLoad } = useLoading();
  const [aiOutput, setAiOutput] = useState('');

  const obj = OBJS[state.obj];
  const hi = state.mapping.filter((m) => m.conf >= 80).length;
  const med = state.mapping.filter((m) => m.conf >= 60 && m.conf < 80).length;
  const unmap = (obj?.fields || []).filter((f) => f.req && !state.mapping.find((m) => m.sap === f.n && m.conf >= 50)).length;

  // -- Auto map fallback (same as original)
  function autoMap(): MappingEntry[] {
    const sem: Record<string, string[]> = {
      'KUNNR':['KUNNR','PARTY_NUMBER','CUST_ID','ID','CUSTOMER_NO','ACCOUNTNUM'],
      'LIFNR':['LIFNR','PARTY_NUMBER','VENDOR_ID','SUPPLIER_ID'],
      'NAME1':['NAME1','PARTY_NAME','CUSTOMER_NAME','VENDOR_NAME','NAME','DESCRIPTION','MAKTX'],
      'LAND1':['LAND1','COUNTRY_CODE','COUNTRY','LAND'],
      'ORT01':['ORT01','CITY','TOWN'],
      'PSTLZ':['PSTLZ','POSTAL_CODE','ZIP','POSTCODE'],
      'REGIO':['REGIO','STATE','PROVINCE','REGION'],
      'STRAS':['STRAS','ADDRESS1','ADDRESS','STREET'],
      'TELF1':['TELF1','PHONE','TELEPHONE'],
      'SMTP_ADDR':['SMTP_ADDR','EMAIL','MAIL'],
      'WAERS':['WAERS','CURRENCY_CODE','CURRENCY','CURR'],
      'ZTERM':['ZTERM','PAYMENT_TERMS','PAY_TERMS'],
      'STCD1':['STCD1','TAX_NUMBER','TAX_ID','TAXNUMBER'],
      'BUKRS':['BUKRS','COMPANY_CODE'],
      'VKORG':['VKORG','SALES_ORG'],
      'EKORG':['EKORG','PURCH_ORG'],
      'MATNR':['MATNR','ID','MATERIAL_NUMBER','ITEM_CODE','PART_NO'],
      'MAKTX':['MAKTX','DESCRIPTION','NAME','MATERIAL_DESC'],
      'MEINS':['MEINS','BASE_UOM','UNIT','UOM'],
      'MTART':['MTART','MATERIAL_TYPE'],
      'MBRSH':['MBRSH','INDUSTRY'],
      'WERKS':['WERKS','PLANT'],
      'LGORT':['LGORT','STORAGE_LOC','STORAGE_LOCATION'],
      'BRGEW':['BRGEW','GROSS_WEIGHT'],
      'NTGEW':['NTGEW','NET_WEIGHT'],
      'GEWEI':['GEWEI','WEIGHT_UNIT'],
    };
    const res: MappingEntry[] = [];
    OBJS[state.obj].fields.forEach((f) => {
      const syns = sem[f.n] || [f.n];
      let best: string | null = null, bs = 0;
      state.headers.forEach((h) => {
        const hu = h.toUpperCase(), fn = f.n.toUpperCase();
        let sc = 0;
        if (hu === fn || syns.map((s) => s.toUpperCase()).includes(hu)) sc = 90;
        else if (hu.includes(fn) || fn.includes(hu)) sc = 72;
        if (sc > bs) { bs = sc; best = h; }
      });
      if (best && bs >= 40) {
        const tr = inferTr(best, f.n, f.t);
        res.push({ src: best, sap: f.n, sapLabel: f.l, conf: bs, tr, note: 'Auto-mapped', req: f.req });
      }
    });
    return res;
  }

  function inferTr(s: string, t: string, tp: string): string {
    const su = s.toUpperCase();
    if (['KUNNR', 'LIFNR'].includes(t)) return 'pad10';
    if (t === 'LAND1' || su.includes('COUNTRY')) return 'country';
    if (tp === 'CUKY' || t === 'WAERS') return 'currency';
    if (t === 'ZTERM' || su.includes('PAYMENT')) return 'payterm';
    if (t === 'MTART') return 'mattype';
    if (tp === 'DATS' || su.includes('DATE')) return 'date8';
    return 'trim';
  }

  async function doAIMap() {
    if (!state.headers.length) { toast('Load data first', 'err'); return; }
    showLoad('AI Field Mapping…', 'AI analyzing semantic field relationships', [
      `Connecting to AI Engine…`,
      `Analyzing ${state.headers.length} source fields…`,
      `Retrieving ${obj?.label} schema…`,
      `Computing semantic matches…`,
      `Generating confidence scores…`,
    ]);
    setTimeout(() => tick(0, 'AI connected'), 400);
    setTimeout(() => tick(1, 'Fields analyzed'), 900);
    try {
      const sapList = obj.fields.map((f) => `${f.n}(${f.l},${f.t},len:${f.len},${f.req ? 'REQUIRED' : 'opt'})`).join(', ');
      const prompt = `Map these source fields from ${state.src} to SAP S/4HANA ${state.obj} fields.\n\nSource fields: ${state.headers.join(', ')}\nSAP fields: ${sapList}\n\nRules:\n- Match by name, semantics, patterns\n- KUNNR/LIFNR: suggest pad10 transform if source is numeric ID\n- LAND1/COUNTRY: suggest country transform\n- WAERS/CURRENCY: suggest currency transform\n- ZTERM/PAYMENT: suggest payterm transform\n- MTART: suggest mattype transform\n- confidence 0-100 (exact=100, semantic=70-90, guess=40-65)\n- Only include confidence>=40\n\nReturn ONLY a JSON array, no explanation:\n[{"src":"SOURCE_FIELD","sap":"SAP_FIELD","conf":85,"tr":"none","note":"reason"}]`;
      const raw = await ai(prompt, state.aiLog);
      setTimeout(() => tick(2, 'SAP schema matched'), 1400);
      setTimeout(() => tick(3, 'Confidence scored'), 1800);
      const parsed = parseAI(raw);
      let mapping: MappingEntry[];
      if (parsed && Array.isArray(parsed) && parsed.length) {
        mapping = (parsed as Record<string, unknown>[]).map((m) => {
          const fd = obj.fields.find((f) => f.n === m.sap);
          return {
            src: String(m.src || ''), sap: String(m.sap || ''), sapLabel: fd?.l || '',
            conf: Number(m.conf) || 50, tr: String(m.tr || 'none'), note: String(m.note || ''), req: fd?.req || false,
          };
        });
      } else {
        mapping = autoMap();
      }
      setTimeout(() => tick(4, 'Transforms assigned'), 2200);
      setTimeout(() => {
        hideLoad();
        dispatch({ type: 'SET_FIELD', field: 'mapping', value: mapping });
        setAiOutput(`AI Mapping Complete — ${mapping.length} fields mapped\n\nHigh confidence (≥80%): ${mapping.filter((m) => m.conf >= 80).map((m) => m.sap).join(', ')}\n\nTransforms assigned: ${mapping.filter((m) => m.tr && m.tr !== 'none').map((m) => m.sap + '=' + m.tr).join(', ')}`);
        toast(`Mapped ${mapping.length} fields · ${mapping.filter((m) => m.conf >= 80).length} high confidence`, 'ok');
      }, 2600);
    } catch {
      const mapping = autoMap();
      setTimeout(() => {
        hideLoad();
        dispatch({ type: 'SET_FIELD', field: 'mapping', value: mapping });
        toast('AI mapping done (fallback mode)', 'info');
      }, 1500);
    }
  }

  function exportMap() {
    if (!state.mapping.length) return;
    const csv = 'Source Field,SAP Field,Label,Confidence,Transform,Required,Note\n' +
      state.mapping.map((m) => `${m.src},${m.sap},"${m.sapLabel || ''}",${m.conf},${m.tr},${m.req ? 'Yes' : 'No'},"${m.note || ''}"`).join('\n');
    dl(csv, 'field_mapping.csv', 'text/csv');
    toast('Mapping exported', 'ok');
  }

  function removeMapping(index: number) {
    const newMapping = [...state.mapping];
    newMapping.splice(index, 1);
    dispatch({ type: 'SET_FIELD', field: 'mapping', value: newMapping });
  }

  function updateTransform(src: string, tr: string) {
    const newMapping = state.mapping.map(m => m.src === src ? { ...m, tr } : m);
    dispatch({ type: 'SET_FIELD', field: 'mapping', value: newMapping });
  }

  return (
    <PageLayout>
      <PageGrid>

      {/* Left Column */}
      <GridCol span={3}>
        <Card>
          <CardHeader title={`Source Fields (${state.headers.length})`} subtitle={state.src} />
          <CardBody className="p-3 space-y-3">
        {state.headers.map((f) => (
          <div key={f} className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-[var(--bg-tertiary)] text-[10px] font-mono text-[var(--text-secondary)]">
            <span>{f}</span>
            {state.mapping.find((m) => m.src === f) && <Badge variant="green" className="text-[8px]">mapped</Badge>}
          </div>
        ))}
        <Divider />
        <div className="text-[10.5px] font-semibold text-[var(--text-secondary)] mb-1.5 px-1">SAP Target ({obj?.fields.length} fields)</div>
        {(obj?.fields || []).map((f) => (
          <div key={f.n} className="px-2.5 py-1.5 rounded-lg bg-[var(--bg-tertiary)]/50 border border-[var(--border-light)]">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[10px] text-teal-600 dark:text-teal-400">{f.n}</span>
              {f.req ? <Badge variant="red" className="text-[8px]">REQ</Badge> :
                state.mapping.find((m) => m.sap === f.n) ? <Badge variant="green" className="text-[8px]">✓</Badge> : null}
            </div>
            <div className="text-[9.5px] text-[var(--text-tertiary)]">{f.l}</div>
          </div>
        ))}
          </CardBody>
        </Card>
      </GridCol>

      {/* Middle Column */}
      <GridCol span={6}>
        <PageHeader title="Step 2 — AI-Powered Field Mapping" subtitle="AI Engine semantically maps source fields to SAP S/4HANA fields with confidence scoring">
          <Button variant="secondary" icon={<ArrowLeft className="w-3.5 h-3.5" />} onClick={() => navigate('/')}>Back</Button>
          <Button variant="cyan" icon={<Bot className="w-3.5 h-3.5" />} onClick={doAIMap}>Generate AI Mapping</Button>
          <Button variant="secondary" size="sm" icon={<Download className="w-3 h-3" />} onClick={exportMap} disabled={!state.mapping.length}>Export CSV</Button>
          <Button variant="primary" icon={<ArrowRight className="w-3.5 h-3.5" />} onClick={() => navigate('/extract')} disabled={!state.mapping.length}>Next: Extract</Button>
        </PageHeader>

        {state.mapping.length > 0 && (
          <StatsGrid>
            <StatBox value={state.mapping.length} label="Fields Mapped" color="var(--color-primary-500)" />
            <StatBox value={hi} label="High Conf ≥80%" color="var(--color-success)" />
            <StatBox value={med} label="Medium 60-79%" color="var(--color-warning)" />
            <StatBox value={unmap} label="Unmapped Required" color="var(--color-danger)" />
          </StatsGrid>
        )}

        <Card>
          <CardHeader title="Field Mapping Table" subtitle="AI-generated · edit transforms inline">
            {state.mapping.length > 0 && (
              <div className="flex gap-1.5 ml-auto">
                <Badge variant="green">≥80%</Badge>
                <Badge variant="amber">60-79%</Badge>
                <Badge variant="red">&lt;60%</Badge>
              </div>
            )}
          </CardHeader>
          <CardBody>
            {state.mapping.length > 0 ? (
              <>
                {/* Header */}
                <div className="grid grid-cols-[1fr_30px_1fr_70px_140px_28px] gap-2 px-2 pb-2 mb-2 border-b border-[var(--border)] font-mono text-[9px] uppercase tracking-wider text-[var(--text-tertiary)]">
                  <span>Source</span><span></span><span>SAP Field</span><span>Conf</span><span>Transform</span><span></span>
                </div>
                {/* Rows */}
                <div className="space-y-1.5">
                  {state.mapping.map((m, i) => {
                    const c = m.conf || 0;
                    const cc = c >= 80 ? 'var(--color-success)' : c >= 60 ? 'var(--color-warning)' : 'var(--color-danger)';
                    const borderCls = c >= 80 ? 'border-emerald-200 dark:border-emerald-800/30' : c >= 60 ? 'border-amber-200 dark:border-amber-800/30' : 'border-red-200 dark:border-red-800/30';
                    return (
                      <div key={i} className={cn('grid grid-cols-[1fr_30px_1fr_70px_140px_28px] gap-2 items-center px-3 py-2 rounded-xl border bg-[var(--bg-tertiary)]/30', borderCls)}>
                        <div>
                          <div className="font-mono text-[11px] text-primary-600 dark:text-primary-400">{m.src || <i className="text-[var(--text-tertiary)]">—</i>}</div>
                          <div className="text-[9.5px] text-[var(--text-tertiary)]">{m.srcType || 'source'}</div>
                        </div>
                        <div className="text-center text-[var(--text-tertiary)]">→</div>
                        <div>
                          <div className="font-mono text-[11px] text-teal-600 dark:text-teal-400">{m.sap}</div>
                          <div className="text-[9.5px] text-[var(--text-tertiary)]">{m.sapLabel} {m.req && <Badge variant="red" className="text-[7px] ml-1">REQ</Badge>}</div>
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <div className="flex-1 h-1 rounded-full bg-[var(--bg)] overflow-hidden">
                              <div className="h-full rounded-full" style={{ width: `${c}%`, background: cc }} />
                            </div>
                            <span className="font-mono text-[9px]" style={{ color: cc }}>{c}%</span>
                          </div>
                        </div>
                        <Select
                          size="sm"
                          value={m.tr || 'none'}
                          onChange={(val) => updateTransform(m.src, val)}
                          className="w-[110px]"
                          options={Object.entries(TRANSFORMS).map(([k, v]) => ({ value: k, label: v.label }))}
                        />
                        <button
                          onClick={() => removeMapping(i)}
                          className="w-6 h-6 flex items-center justify-center rounded-lg border border-[var(--border)] hover:border-red-300 text-[var(--text-tertiary)] hover:text-red-500 transition-colors cursor-pointer"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <EmptyState icon={<Bot className="w-10 h-10" />} message={`Click Generate AI Mapping — The AI Engine will semantically match your ${state.headers.length} source fields to SAP ${obj?.label} field definitions`} />
            )}
          </CardBody>
        </Card>

        {aiOutput && (
          <Card>
            <CardHeader icon={<Bot className="w-4 h-4" />} title="AI Analysis Output" />
            <CardBody><AIResponse>{aiOutput}</AIResponse></CardBody>
          </Card>
        )}
      </GridCol>

      {/* Right Column */}
      <GridCol span={3}>
        <Card>
          <CardBody className="p-3 space-y-4">
        <div className="text-[11.5px] font-bold text-[var(--text-secondary)] mb-1">Transform Rules</div>
        {Object.entries(TRANSFORMS).map(([k, v]) => (
          <div key={k} className="px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--bg-tertiary)]/50">
            <div className="font-mono text-[10px] text-teal-600 dark:text-teal-400">{k}</div>
            <div className="text-[10px] text-[var(--text-tertiary)]">{v.label}</div>
          </div>
        ))}
          </CardBody>
        </Card>
      </GridCol>
          
      </PageGrid>
    </PageLayout>
  );
}
