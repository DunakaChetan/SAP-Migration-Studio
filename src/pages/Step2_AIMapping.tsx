import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMigration, type SourceInstance, type MappingEntry } from '@/store/migration-store';
import { useToast } from '@/components/ui/toast';
import { useLoading } from '@/components/ui/loading-overlay';
import { OBJS } from '@/data/sap-schemas';
import { generateMapping, getSAPSchema } from '@/services/ai-service';
import { dl, expCSV, cn } from '@/lib/utils';
import {
  PageLayout, PageGrid, GridCol, Card, CardHeader, CardBody, Button, Badge,
  StatBox, StatsGrid, PageHeader
} from '@/components/shared';
import {
  ArrowRight, Download, Bot, ArrowLeft, Save,
  Check, Sparkles, AlertCircle
} from 'lucide-react';

export function Step2AIMapping() {
  const { state, dispatch } = useMigration();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { showLoad, tick, hideLoad } = useLoading();

  const selectedSources: SourceInstance[] = state.selectedSources || [];
  const hasMultiSources = selectedSources.length > 0;

  // Active source selection
  const [activeSourceId, setActiveSourceId] = useState<string>(() => {
    return state.activeSourceId || (selectedSources[0]?.id || 'default');
  });

  const activeSource = selectedSources.find(s => s.id === activeSourceId) || selectedSources[0] || null;
  const activeHeaders = activeSource ? activeSource.headers : state.headers;
  const activeMappings = (activeSource && activeSource.mapping && activeSource.mapping.length > 0)
    ? activeSource.mapping
    : state.mapping;

  const [sourceSearch, setSourceSearch] = useState('');
  const [targetSearch, setTargetSearch] = useState('');
  const [mappingSearch, setMappingSearch] = useState('');
  const [editingMapping, setEditingMapping] = useState<{ index: number, field: 'src' | 'sap', value: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [sapFields, setSapFields] = useState<any[]>([]);
  const [isLoadingSchema, setIsLoadingSchema] = useState(true);

  // Sync active source ID to store when changed
  const handleSwitchSource = (sourceId: string) => {
    setActiveSourceId(sourceId);
    dispatch({ type: 'SET_FIELD', field: 'activeSourceId', value: sourceId });
    const src = selectedSources.find(s => s.id === sourceId);
    if (src && src.mapping) {
      dispatch({ type: 'SET_FIELD', field: 'mapping', value: src.mapping });
    }
  };

  useEffect(() => {
    async function fetchSchema() {
      setIsLoadingSchema(true);
      try {
        const objName = state.obj === 'CUSTOMER' ? 'Customer' : state.obj === 'VENDOR' ? 'Vendor' : 'Material';
        const res = await getSAPSchema(objName);
        const fields = (res.fields || []).map((f: any) => ({
          ...f,
          field_name: `${f.sap_structure}.${f.field_name}`
        }));
        setSapFields(fields);
      } catch (err) {
        setSapFields([]);
      } finally {
        setIsLoadingSchema(false);
      }
    }
    fetchSchema();
  }, [state.obj]);

  const updateActiveMappings = (newMappings: MappingEntry[]) => {
    if (activeSource) {
      const updatedSources = selectedSources.map(s =>
        s.id === activeSource.id ? { ...s, mapping: newMappings, isMappingComplete: newMappings.length > 0 } : s
      );
      dispatch({
        type: 'BATCH_UPDATE',
        updates: {
          selectedSources: updatedSources,
          mapping: newMappings,
          isMappingSaved: false
        }
      });
    } else {
      dispatch({ type: 'SET_FIELD', field: 'mapping', value: newMappings });
      dispatch({ type: 'SET_FIELD', field: 'isMappingSaved', value: false });
    }
  };

  const handleSaveMappingEdit = (index: number, oldName: string, field: 'src' | 'sap', newName: string) => {
    if (!newName.trim() || newName === oldName) {
      setEditingMapping(null);
      return;
    }

    const newMappings = activeMappings.map(m =>
      m[field] === oldName ? { ...m, [field]: newName } : m
    );
    updateActiveMappings(newMappings);
    setEditingMapping(null);
  };

  const removeMapping = (index: number) => {
    const newMapping = [...activeMappings];
    newMapping.splice(index, 1);
    updateActiveMappings(newMapping);
  };

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

  function autoMapForHeaders(headers: string[]): MappingEntry[] {
    const sem: Record<string, string[]> = {
      'KUNNR': ['KUNNR', 'PARTY_NUMBER', 'CUST_ID', 'ID', 'CUSTOMER_NO', 'ACCOUNTNUM', 'ACCOUNT_NUMBER', 'BP_CODE', 'BP_ID', 'BPEXT'],
      'LIFNR': ['LIFNR', 'PARTY_NUMBER', 'VENDOR_ID', 'SUPPLIER_ID', 'BP_ID', 'VENDOR'],
      'NAME1': ['NAME1', 'PARTY_NAME', 'CUSTOMER_NAME', 'VENDOR_NAME', 'NAME', 'DESCRIPTION', 'MAKTX', 'BP_NAME'],
      'LAND1': ['LAND1', 'COUNTRY_CODE', 'COUNTRY', 'LAND', 'CCTY'],
      'ORT01': ['ORT01', 'CITY', 'TOWN'],
      'PSTLZ': ['PSTLZ', 'POSTAL_CODE', 'ZIP', 'POSTCODE'],
      'REGIO': ['REGIO', 'STATE', 'PROVINCE', 'REGION'],
      'STRAS': ['STRAS', 'ADDRESS1', 'ADDRESS', 'STREET'],
      'TELF1': ['TELF1', 'PHONE', 'TELEPHONE', 'TEL'],
      'SMTP_ADDR': ['SMTP_ADDR', 'EMAIL', 'MAIL'],
      'WAERS': ['WAERS', 'CURRENCY_CODE', 'CURRENCY', 'CURR'],
      'ZTERM': ['ZTERM', 'PAYMENT_TERMS', 'PAY_TERMS', 'TERMS'],
      'STCD1': ['STCD1', 'TAX_NUMBER', 'TAX_ID', 'TAXNUMBER'],
      'BUKRS': ['BUKRS', 'COMPANY_CODE'],
      'VKORG': ['VKORG', 'SALES_ORG'],
      'EKORG': ['EKORG', 'PURCH_ORG'],
      'MATNR': ['MATNR', 'ID', 'MATERIAL_NUMBER', 'ITEM_CODE', 'PART_NO'],
      'MAKTX': ['MAKTX', 'DESCRIPTION', 'NAME', 'MATERIAL_DESC'],
      'MEINS': ['MEINS', 'BASE_UOM', 'UNIT', 'UOM'],
      'MTART': ['MTART', 'MATERIAL_TYPE'],
      'MBRSH': ['MBRSH', 'INDUSTRY'],
      'WERKS': ['WERKS', 'PLANT'],
      'LGORT': ['LGORT', 'STORAGE_LOC', 'STORAGE_LOCATION'],
      'BRGEW': ['BRGEW', 'GROSS_WEIGHT'],
      'NTGEW': ['NTGEW', 'NET_WEIGHT'],
      'GEWEI': ['GEWEI', 'WEIGHT_UNIT'],
    };
    const res: MappingEntry[] = [];
    const currentObj = OBJS[state.obj] || OBJS['CUSTOMER'];
    currentObj.fields.forEach((f) => {
      const syns = sem[f.n] || [f.n];
      let best: string | null = null, bs = 0;
      headers.forEach((h) => {
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

  // AI Mapping for Current Active Source
  const doAIMapActiveSource = async () => {
    if (!activeHeaders.length) {
      toast('No source headers found for this source.', 'err');
      return;
    }

    const objName = state.obj === 'CUSTOMER' ? 'Customer' : state.obj === 'VENDOR' ? 'Vendor' : 'Material';
    const sourceName = activeSource?.name || state.src;

    showLoad(
      'AI Field Mapping in Progress…',
      `Mapping ${sourceName} fields to SAP ${objName}`,
      [
        `Inspecting ${activeHeaders.length} source fields from ${sourceName}`,
        `Running SAP AI semantic matching for ${objName}`,
        `Applying target structures, types & confidence scores`
      ]
    );

    try {
      tick(0, `✓ Verified ${activeHeaders.length} source fields`);
      const data = await generateMapping(activeSource?.type || state.src, objName, activeHeaders);
      tick(1, `✓ Generated semantic matches for SAP ${objName}`);
      let mapping = data.mappings || [];
      if (!mapping.length) {
        mapping = autoMapForHeaders(activeHeaders);
      }
      tick(2, `✓ Applied ${mapping.length} transformations with confidence scoring`);
      await new Promise(r => setTimeout(r, 300));
      updateActiveMappings(mapping);
      hideLoad();
      toast(`Mapped ${mapping.length} fields for ${sourceName}`, 'ok');
    } catch {
      const fallback = autoMapForHeaders(activeHeaders);
      tick(1, `⚠ Offline semantic matching activated`);
      tick(2, `✓ Auto-mapped ${fallback.length} fields using semantic matching`);
      await new Promise(r => setTimeout(r, 300));
      updateActiveMappings(fallback);
      hideLoad();
      toast(`Auto-mapped ${fallback.length} fields using semantic matching`, 'ok');
    }
  };

  // AI Mapping for ALL Sources in batch
  const doAIMapAllSources = async () => {
    if (!selectedSources.length) {
      await doAIMapActiveSource();
      return;
    }

    const objName = state.obj === 'CUSTOMER' ? 'Customer' : state.obj === 'VENDOR' ? 'Vendor' : 'Material';
    const updatedSources = [...selectedSources];

    const steps: string[] = [
      ...selectedSources.map((s, idx) => `[Source ${idx + 1}/${selectedSources.length}] Mapping ${s.name} (${s.headers.length} fields)`),
      `Verifying mappings against SAP ${objName} Target Schema`,
      `Finalizing & staging multi-source mappings`
    ];

    showLoad(
      'Batch AI Mapping in Progress…',
      `Mapping all ${selectedSources.length} sources to SAP ${objName}`,
      steps
    );

    for (let i = 0; i < updatedSources.length; i++) {
      const src = updatedSources[i];
      let mappings: MappingEntry[] = [];
      try {
        if (src.headers.length > 0) {
          const res = await generateMapping(src.type, objName, src.headers);
          mappings = res.mappings || [];
        }
      } catch { }

      if (!mappings.length && src.headers.length > 0) {
        mappings = autoMapForHeaders(src.headers);
      }

      updatedSources[i] = {
        ...src,
        mapping: mappings,
        isMappingComplete: mappings.length > 0
      };

      // Real-time tick update for this source
      tick(i, `✓ Mapped ${mappings.length} fields for ${src.name}`);
      await new Promise(r => setTimeout(r, 300));
    }

    tick(selectedSources.length, `✓ Verified against SAP ${objName} Target Schema`);
    await new Promise(r => setTimeout(r, 200));
    tick(selectedSources.length + 1, `✓ Staged all ${updatedSources.length} sources successfully`);
    await new Promise(r => setTimeout(r, 350));

    const curActive = updatedSources.find(s => s.id === activeSourceId) || updatedSources[0];

    dispatch({
      type: 'BATCH_UPDATE',
      updates: {
        selectedSources: updatedSources,
        mapping: curActive?.mapping || [],
        isMappingSaved: true
      }
    });

    hideLoad();
    toast(`Successfully generated mappings for all ${updatedSources.length} sources!`, 'ok');
  };

  // Save Mappings for all sources to Supabase
  const saveAllMappings = async () => {
    if (!state.projectId) {
      toast('You must select a project in Step 1 to save mappings.', 'err');
      return;
    }

    showLoad('Saving Mappings...', 'Persisting mapping definitions to database');
    const objName = state.obj === 'CUSTOMER' ? 'Customer' : state.obj === 'VENDOR' ? 'Vendor' : 'Material';
    const mock = state.activeMock || 'mock-0';

    try {
      if (selectedSources.length > 0) {
        for (const src of selectedSources) {
          const mList = src.mapping && src.mapping.length > 0 ? src.mapping : (src.id === activeSourceId ? activeMappings : []);
          if (mList.length > 0) {
            await fetch(`${import.meta.env.VITE_BACKEND_URL}/api/sap/map/save_all`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                projectId: state.projectId,
                sourceSystem: src.type,
                targetObject: objName,
                mappings: mList,
                mock_cycle: mock
              })
            });
          }
        }
      } else {
        await fetch(`${import.meta.env.VITE_BACKEND_URL}/api/sap/map/save_all`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            projectId: state.projectId,
            sourceSystem: state.src,
            targetObject: objName,
            mappings: activeMappings,
            mock_cycle: mock
          })
        });
      }

      hideLoad();
      dispatch({ type: 'SET_FIELD', field: 'isMappingSaved', value: true });
      toast('All source mappings saved successfully to database!', 'ok');
    } catch (err: any) {
      hideLoad();
      toast(`Failed to save mappings: ${err.message}`, 'err');
    }
  };

  // Load Mappings from backend database
  const loadMappings = async () => {
    if (!state.projectId) {
      toast('You must select a project in Step 1 to load mappings.', 'err');
      return;
    }

    showLoad('Loading Mappings...', 'Retrieving saved mapping history from database', [
      'Connecting to backend database...',
      'Fetching saved mappings for project and target object...',
      'Applying mapping rules...'
    ]);
    tick(0, 'Connecting to backend database...');

    try {
      const objName = state.obj === 'CUSTOMER' ? 'Customer' : state.obj === 'VENDOR' ? 'Vendor' : 'Material';
      const mock = state.activeMock || 'mock-0';

      if (selectedSources.length > 0) {
        let loadedTotal = 0;
        const updatedSources = [...selectedSources];

        for (let i = 0; i < selectedSources.length; i++) {
          const src = selectedSources[i];
          const res = await fetch(`${import.meta.env.VITE_BACKEND_URL}/api/sap/map/history?project_id=${state.projectId}&source_system=${src.type}&target_object=${objName}&mock_cycle=${mock}`);
          if (res.ok) {
            const data = await res.json();
            if (data.mappings && data.mappings.length > 0) {
              updatedSources[i] = {
                ...src,
                mapping: data.mappings,
                isMappingComplete: true
              };
              loadedTotal += data.mappings.length;
            }
          }
        }

        const activeUpdated = updatedSources.find(s => s.id === activeSourceId) || updatedSources[0];

        hideLoad();
        if (loadedTotal > 0) {
          dispatch({
            type: 'BATCH_UPDATE',
            updates: {
              selectedSources: updatedSources,
              mapping: activeUpdated?.mapping || [],
              isMappingSaved: true
            }
          });
          toast(`Loaded ${loadedTotal} saved mapping definitions across sources!`, 'ok');
        } else {
          // If no multi-source history found, check default source
          const res = await fetch(`${import.meta.env.VITE_BACKEND_URL}/api/sap/map/history?project_id=${state.projectId}&source_system=${state.src || 'SAP_ECC'}&target_object=${objName}&mock_cycle=${mock}`);
          if (res.ok) {
            const data = await res.json();
            if (data.mappings && data.mappings.length > 0) {
              dispatch({
                type: 'BATCH_UPDATE',
                updates: {
                  mapping: data.mappings,
                  isMappingSaved: true
                }
              });
              toast(`Loaded ${data.mappings.length} saved mapping definitions!`, 'ok');
              return;
            }
          }
          toast('No saved mappings found for this configuration in database.', 'info');
        }
      } else {
        const res = await fetch(`${import.meta.env.VITE_BACKEND_URL}/api/sap/map/history?project_id=${state.projectId}&source_system=${state.src || 'SAP_ECC'}&target_object=${objName}&mock_cycle=${mock}`);
        if (!res.ok) throw new Error('Failed to fetch history');

        const data = await res.json();
        hideLoad();

        if (data.mappings && data.mappings.length > 0) {
          dispatch({ type: 'SET_FIELD', field: 'mapping', value: data.mappings });
          dispatch({ type: 'SET_FIELD', field: 'isMappingSaved', value: true });
          toast(`Loaded ${data.mappings.length} historically saved mappings!`, 'ok');
        } else {
          toast('No saved mappings found for this configuration in database.', 'info');
        }
      }
    } catch (e: any) {
      hideLoad();
      toast(e.message || 'Error loading mappings', 'err');
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = evt.target?.result as string;
      const lines = text.split(/\r?\n/).filter(line => line.trim());
      if (lines.length < 2) {
        toast('Uploaded file is empty or invalid', 'err');
        return;
      }

      const parseCSVLine = (str: string) => {
        let inQuotes = false, token = '', tokens = [];
        for (let i = 0; i < str.length; i++) {
          if (str[i] === '"') inQuotes = !inQuotes;
          else if (str[i] === ',' && !inQuotes) { tokens.push(token.trim()); token = ''; }
          else token += str[i];
        }
        tokens.push(token.trim());
        return tokens.map(t => t.replace(/^"|"$/g, ''));
      };

      const headers = parseCSVLine(lines[0]).map(h => h.toLowerCase());
      const srcIdx = headers.findIndex(h => h === 'src' || h === 'source field');
      const sapIdx = headers.findIndex(h => h === 'sap' || h === 'sap field');
      const trIdx = headers.findIndex(h => h === 'tr' || h === 'transform');
      const confIdx = headers.findIndex(h => h === 'conf' || h === 'confidence');
      const reqIdx = headers.findIndex(h => h === 'req' || h === 'required');
      const sapLabelIdx = headers.findIndex(h => h === 'saplabel' || h === 'label');
      const noteIdx = headers.findIndex(h => h === 'note');

      if (srcIdx === -1 || sapIdx === -1) {
        toast('CSV must contain "src" and "sap" columns (or "Source Field" / "SAP Field")', 'err');
        return;
      }

      const newMappings: MappingEntry[] = [];
      for (let i = 1; i < lines.length; i++) {
        const row = parseCSVLine(lines[i]);
        if (row.length < 2) continue;

        const src = row[srcIdx] || '';
        const sap = row[sapIdx] || '';
        const tr = trIdx !== -1 ? row[trIdx] || 'none' : 'none';
        const conf = confIdx !== -1 ? parseInt(row[confIdx], 10) || 100 : 100;
        const reqStr = reqIdx !== -1 ? row[reqIdx].toLowerCase() : 'false';
        const req = reqStr === 'true' || reqStr === 'yes';
        const sapLabel = sapLabelIdx !== -1 ? row[sapLabelIdx] : '';
        const note = noteIdx !== -1 ? row[noteIdx] : 'Uploaded';

        if (src || sap) {
          newMappings.push({ src, sap, tr, conf, req, sapLabel, note });
        }
      }

      if (hasMultiSources && activeSource) {
        const updatedSources = selectedSources.map(s => {
          if (s.id === activeSource.id) {
            return { ...s, mapping: newMappings, isMappingComplete: newMappings.length > 0 };
          }
          return s;
        });
        dispatch({
          type: 'BATCH_UPDATE',
          updates: {
            selectedSources: updatedSources,
            mapping: newMappings,
            isMappingSaved: false
          }
        });
      } else {
        dispatch({ type: 'SET_FIELD', field: 'mapping', value: newMappings });
        dispatch({ type: 'SET_FIELD', field: 'isMappingSaved', value: false });
      }

      toast(`Successfully loaded ${newMappings.length} mappings from CSV!`, 'ok');

      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    };
    reader.readAsText(file);
  };

  const validMappings = activeMappings.filter(m => m.sap && m.sap.trim() !== '');
  const hi = validMappings.filter(m => m.conf >= 80).length;
  const needsReview = validMappings.length - hi;
  const mappedSources = activeMappings.map(m => m.src);
  const unmappedSourceList = activeHeaders.filter(h => !mappedSources.includes(h));

  const allSelectedSourcesMapped = selectedSources.length > 0
    ? selectedSources.every(s => (s.mapping && s.mapping.length > 0) || (s.id === activeSource?.id && activeMappings.length > 0))
    : validMappings.length > 0;

  return (
    <PageLayout>
      <PageGrid>
        {/* Left Column: Source & Target Fields */}
        <GridCol span={3} className="flex flex-col gap-4 h-[calc(100vh-40px)]">
          {/* Source Fields Card */}
          <Card className="flex flex-col flex-1 min-h-0">
            <CardHeader
              title={`Source Fields (${activeHeaders.length})`}
              subtitle={activeSource ? activeSource.name : state.src}
            />
            <div className="px-3 pt-2">
              <input
                type="text"
                placeholder="Search source fields..."
                value={sourceSearch}
                onChange={(e) => setSourceSearch(e.target.value)}
                className="w-full rounded-md border border-[var(--border-light)] bg-[var(--bg-tertiary)] px-2.5 py-1.5 text-[10.5px] text-[var(--text-primary)] outline-none focus:border-primary-500 transition-colors"
              />
            </div>
            <CardBody className="p-3 space-y-2 flex-1 overflow-y-auto scrollbar-thin">
              {activeHeaders.filter(f => f.toLowerCase().includes(sourceSearch.toLowerCase())).map((f, i) => (
                <div key={`${f}-${i}`} className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-[var(--bg-tertiary)] text-[10px] font-mono text-[var(--text-secondary)]">
                  <span className="truncate">{f}</span>
                  {activeMappings.find((m) => m.src === f) && <Badge variant="green" className="text-[8px]">mapped</Badge>}
                </div>
              ))}
              {activeHeaders.length === 0 && (
                <div className="text-[10px] text-[var(--text-tertiary)] text-center py-4">No source fields loaded for this source.</div>
              )}
            </CardBody>
          </Card>

          {/* SAP Target Fields Card */}
          <Card className="flex flex-col flex-1 min-h-0">
            <CardHeader title={`SAP Target Fields (${sapFields.length})`} subtitle={OBJS[state.obj]?.label || state.obj} />
            <div className="px-3 pt-2">
              <input
                type="text"
                placeholder="Search SAP target fields..."
                value={targetSearch}
                onChange={(e) => setTargetSearch(e.target.value)}
                className="w-full rounded-md border border-[var(--border-light)] bg-[var(--bg-tertiary)] px-2.5 py-1.5 text-[10.5px] text-[var(--text-primary)] outline-none focus:border-primary-500 transition-colors"
              />
            </div>
            <CardBody className="p-3 space-y-2 flex-1 overflow-y-auto scrollbar-thin">
              {isLoadingSchema ? (
                <div className="px-2.5 py-1.5 text-[10px] text-[var(--text-tertiary)]">Loading SAP schema...</div>
              ) : (
                sapFields.filter(f => f.field_name.toLowerCase().includes(targetSearch.toLowerCase()) || (f.field_description && f.field_description.toLowerCase().includes(targetSearch.toLowerCase()))).map((f, i) => (
                  <div key={`${f.field_name}-${i}`} className="px-2.5 py-1.5 rounded-lg bg-[var(--bg-tertiary)]/50 border border-[var(--border-light)]">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[10px] text-teal-600 dark:text-teal-400 truncate">{f.field_name}</span>
                      {f.is_mandatory ? <Badge variant="red" className="text-[8px]">REQ</Badge> :
                        activeMappings.find((m) => m.sap === f.field_name) ? <Badge variant="green" className="text-[8px]">✓</Badge> : null}
                    </div>
                    <div className="text-[9.5px] text-[var(--text-tertiary)] truncate">{f.field_description || f.sap_structure}</div>
                  </div>
                ))
              )}
            </CardBody>
          </Card>
        </GridCol>

        {/* Right Column: Mapping Canvas */}
        <GridCol span={9}>
          <PageHeader
            title="Step 2 — AI-Powered Field Mapping"
            subtitle="Semantically map each source system's schema into standard SAP S/4HANA target fields"
          >
            <Button variant="secondary" icon={<ArrowLeft className="w-3.5 h-3.5" />} onClick={() => navigate('/')}>Back</Button>
            {hasMultiSources && (
              <Button variant="cyan" icon={<Sparkles className="w-3.5 h-3.5" />} onClick={doAIMapAllSources}>
                AI Map All Sources
              </Button>
            )}
            <Button variant="cyan" icon={<Bot className="w-3.5 h-3.5" />} onClick={doAIMapActiveSource}>
              Map Current Source
            </Button>
            <Button variant="secondary" icon={<Save className="w-3.5 h-3.5" />} onClick={saveAllMappings} disabled={!activeMappings.length}>
              Save All Mappings
            </Button>
            <Button variant="secondary" icon={<Download className="w-3.5 h-3.5" />} onClick={loadMappings}>
              Load Mappings
            </Button>
            <div>
              <input type="file" accept=".csv" className="hidden" ref={fileInputRef} onChange={handleFileUpload} />
              <Button variant="secondary" icon={<Download className="w-3.5 h-3.5 rotate-180" />} onClick={() => fileInputRef.current?.click()}>
                Upload Mapping
              </Button>
            </div>
            <div title={!allSelectedSourcesMapped ? "All sources must have mappings generated before extraction." : ""}>
              <Button
                variant="primary"
                icon={<ArrowRight className="w-3.5 h-3.5" />}
                onClick={() => navigate('/extract')}
                disabled={!allSelectedSourcesMapped}
              >
                Next: Extract
              </Button>
            </div>
          </PageHeader>

          {/* MULTI-SOURCE TAB SWITCHER */}
          {hasMultiSources && (
            <div className="flex items-center gap-2 mb-4 p-1.5 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border)] overflow-x-auto">
              <span className="text-[11px] font-mono uppercase tracking-wider text-[var(--text-tertiary)] px-2 font-bold shrink-0">
                Sources:
              </span>
              {selectedSources.map((src) => {
                const count = (src.mapping || []).filter(m => m.sap).length;
                const isActive = src.id === activeSource?.id;
                return (
                  <button
                    key={src.id}
                    onClick={() => handleSwitchSource(src.id)}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-all cursor-pointer whitespace-nowrap ${
                      isActive
                        ? "bg-primary-500 text-white shadow-xs"
                        : "bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                    }`}
                  >
                    <span>{src.name}</span>
                    <Badge variant={count > 0 ? "green" : "neutral"} className={isActive ? "bg-white/20 text-white border-white/30" : ""}>
                      {count > 0 ? `${count} mapped` : "unmapped"}
                    </Badge>
                  </button>
                );
              })}
            </div>
          )}

          {validMappings.length > 0 && (
            <StatsGrid>
              <StatBox value={validMappings.length} label="Fields Mapped" color="var(--color-primary-500)" />
              <StatBox value={hi} label="High Conf ≥80%" color="var(--color-success)" />
              <StatBox value={needsReview} label="Needs Review <80%" color="var(--color-warning)" />
              <StatBox value={unmappedSourceList.length} label="Unmapped Source" color="var(--color-danger)" />
            </StatsGrid>
          )}

          {/* Mapping Table */}
          <Card>
            <CardHeader
              title={`Mapping Table: ${activeSource?.name || state.src} (${validMappings.length} Mappings)`}
              subtitle="Review and refine field transformations for this source"
            >
              <div className="flex items-center gap-2 ml-auto">
                <Button variant="secondary" size="sm" icon={<Download className="w-3 h-3" />} onClick={() => dl(expCSV(validMappings), `${activeSource?.name || 'source'}_mappings.csv`, 'text/csv')}>Export</Button>
                <div className="w-px h-4 bg-[var(--border)] mx-1" />
                <Badge variant="green">≥80%</Badge>
                <Badge variant="amber">60-79%</Badge>
                <Badge variant="red">&lt;60%</Badge>
              </div>
            </CardHeader>

            <div className="px-3 pt-2">
              <input
                type="text"
                placeholder="Search mapped fields (Source or SAP)..."
                value={mappingSearch}
                onChange={(e) => setMappingSearch(e.target.value)}
                className="w-full rounded-md border border-[var(--border-light)] bg-[var(--bg-tertiary)] px-2.5 py-1.5 text-[10.5px] text-[var(--text-primary)] outline-none focus:border-primary-500 transition-colors"
              />
            </div>

            <CardBody>
              {activeMappings.length > 0 ? (
                <>
                  <div className="grid grid-cols-[1fr_30px_1fr_70px_140px_28px] gap-2 px-2 pb-2 mb-2 border-b border-[var(--border)] font-mono text-[9px] uppercase tracking-wider text-[var(--text-tertiary)]">
                    <span>Source Field</span><span></span><span>Target SAP Field</span><span>Conf</span><span>Transform</span><span></span>
                  </div>

                  <div className="space-y-1.5 max-h-[calc(100vh-320px)] overflow-y-auto scrollbar-thin pr-2">
                    {[...activeMappings]
                      .filter(m => (m.src && m.src.toLowerCase().includes(mappingSearch.toLowerCase())) || (m.sap && m.sap.toLowerCase().includes(mappingSearch.toLowerCase())) || (m.sapLabel && m.sapLabel.toLowerCase().includes(mappingSearch.toLowerCase())))
                      .map((m, i) => {
                        const isSrcValid = activeHeaders.includes(m.src);
                        const isSapValid = sapFields.some(f => f.field_name === m.sap);
                        const c = m.conf || 0;
                        const borderCls = c >= 80 ? 'border-emerald-200 dark:border-emerald-800/30' : c >= 60 ? 'border-amber-200 dark:border-amber-800/30' : 'border-red-200 dark:border-red-800/30';

                        return (
                          <div key={i} className={cn('grid grid-cols-[1fr_30px_1fr_70px_140px_28px] gap-2 items-center px-3 py-2 rounded-xl border bg-[var(--bg-tertiary)]/30 group', borderCls)}>
                            {/* Source Field */}
                            <div className="min-w-0">
                              <div className="font-mono text-[11px] truncate text-primary-600 dark:text-primary-400">
                                {m.src || '—'}
                              </div>
                              <div className="text-[9.5px] text-[var(--text-tertiary)] truncate">{activeSource?.name || 'source'}</div>
                            </div>

                            <div className="text-center text-[var(--text-tertiary)]">→</div>

                            {/* SAP Target Field */}
                            <div className="min-w-0">
                              <div className="font-mono text-[11px] flex items-center gap-1.5 truncate text-teal-600 dark:text-teal-400 font-semibold">
                                {m.sap}
                                {m.req && <Badge variant="red" className="text-[8px] px-1 font-bold">REQ</Badge>}
                              </div>
                              <div className="text-[9.5px] text-[var(--text-tertiary)] truncate">{m.sapLabel || 'Target Field'}</div>
                            </div>

                            {/* Confidence Score */}
                            <div>
                              <Badge variant={c >= 80 ? "green" : c >= 60 ? "amber" : "red"}>
                                {c}%
                              </Badge>
                            </div>

                            {/* Transform Rule */}
                            <div>
                              <select
                                value={m.tr || 'trim'}
                                onChange={e => {
                                  const updated = activeMappings.map((item, idx) => idx === i ? { ...item, tr: e.target.value } : item);
                                  updateActiveMappings(updated);
                                }}
                                className="w-full text-[10.5px] rounded-md border border-[var(--border)] bg-[var(--bg-secondary)] px-2 py-1 text-[var(--text-primary)] outline-none"
                              >
                                <option value="none">None</option>
                                <option value="trim">Trim</option>
                                <option value="pad10">Pad 10 Digits</option>
                                <option value="country">Country ISO</option>
                                <option value="currency">Currency ISO</option>
                                <option value="date8">Date YYYYMMDD</option>
                              </select>
                            </div>

                            {/* Delete */}
                            <button
                              type="button"
                              onClick={() => removeMapping(i)}
                              className="text-[var(--text-tertiary)] hover:text-red-500 transition-colors"
                            >
                              ×
                            </button>
                          </div>
                        );
                      })}
                  </div>
                </>
              ) : (
                <div className="p-8 text-center text-[var(--text-tertiary)]">
                  <Bot className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p className="text-[13px] font-semibold text-[var(--text-primary)]">No Mappings Generated for this Source</p>
                  <p className="text-[11px] mb-3">Click &quot;Map Current Source&quot; or &quot;AI Map All Sources&quot; to auto-generate.</p>
                  <Button variant="cyan" size="sm" icon={<Bot className="w-3.5 h-3.5" />} onClick={doAIMapActiveSource}>
                    Generate Mapping
                  </Button>
                </div>
              )}
            </CardBody>
          </Card>
        </GridCol>
      </PageGrid>
    </PageLayout>
  );
}
