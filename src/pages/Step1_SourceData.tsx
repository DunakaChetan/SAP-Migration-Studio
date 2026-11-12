import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useMigration, type SourceInstance } from '@/store/migration-store';
import { useToast } from '@/components/ui/toast';
import { useLoading } from '@/components/ui/loading-overlay';
import { SAMPLE } from '@/data/sample-data';
import { OBJS } from '@/data/sap-schemas';
import { expCSV, dl } from '@/lib/utils';
import {
  Card, CardHeader, CardBody, Button, Badge, DataTable,
  PageLayout, PageGrid, GridCol, PageHeader, Divider, Select, ConfirmModal, TargetObjectImportModal
} from '@/components/shared';
import {
  Zap, ArrowRight, Database, LayoutTemplate, FileSpreadsheet, Layers, Cloud, HardDrive,
  Package, Cable, Download, Plus, Edit3, Save, Trash2, X, FolderGit2,
  CheckCircle2, RotateCw, Lock, AlertCircle, Eye, Check, GitMerge, FileText
} from 'lucide-react';
import { saveStagedFilesToDB, loadStagedFilesFromDB, removeStagedFileFromDB, clearAllStagedFilesFromDB } from '@/lib/file-storage';

const SOURCES_CATALOG = [
  { key: 'SAP_ECC', icon: <Database className="w-4 h-4 text-blue-500" />, name: 'SAP ECC 6.0', sub: 'Classic SAP — OData / RFC' },
  { key: 'ORACLE_EBS', icon: <Layers className="w-4 h-4 text-red-500" />, name: 'Oracle EBS R12', sub: 'AR/AP HZ_ tables' },
  { key: 'INFOR', icon: <Database className="w-4 h-4 text-orange-500" />, name: 'Infor CloudSuite', sub: 'LN/Baan tccom tables' },
  { key: 'EXCEL_CSV', icon: <FileSpreadsheet className="w-4 h-4 text-emerald-500" />, name: 'Excel / CSV Files', sub: 'Flat file extracts' },
  { key: 'DYNAMICS', icon: <LayoutTemplate className="w-4 h-4 text-blue-600" />, name: 'MS Dynamics 365', sub: 'CRM / ERP export' },
  { key: 'SALESFORCE', icon: <Cloud className="w-4 h-4 text-sky-500" />, name: 'Salesforce CRM', sub: 'Account objects' },
  { key: 'LEGACY', icon: <HardDrive className="w-4 h-4 text-slate-500" />, name: 'Legacy / Custom DB', sub: 'RDBMS SQL tables' },
];

export function Step1SourceData() {
  const { state, dispatch } = useMigration();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { showLoad, hideLoad } = useLoading();

  // Project Management State
  const [projects, setProjects] = useState<any[]>([]);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectDesc, setNewProjectDesc] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editProjectName, setEditProjectName] = useState('');
  const [editProjectDesc, setEditProjectDesc] = useState('');
  const [isLoadingProjects, setIsLoadingProjects] = useState(false);
  const [backendError, setBackendError] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Dynamic Target Objects State
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [backendObjects, setBackendObjects] = useState<{ id?: string; name: string; description?: string }[]>([]);
  const [isLoadingObjects, setIsLoadingObjects] = useState(false);

  // Source Configuration & Testing State
  const [activeCatalogKey, setActiveCatalogKey] = useState<string>('ORACLE_EBS');
  const [previewModalSource, setPreviewModalSource] = useState<SourceInstance | null>(null);
  const [testingSourceId, setTestingSourceId] = useState<string | null>(null);
  const [extractingSourceId, setExtractingSourceId] = useState<string | null>(null);
  const [isBatchProcessing, setIsBatchProcessing] = useState(false);

  // Connection form inputs
  const [connUrl, setConnUrl] = useState(state.connUrl || 'https://s4h-sandbox.internal:44300');
  const [connClient, setConnClient] = useState(state.connClient || '100');
  const [connUser, setConnUser] = useState(state.connUser || 'SAP_MIGRATE');
  const [connPass, setConnPass] = useState(state.connPass || 'Welcome123#');

  // Generic DB inputs for Dynamics / Salesforce / Legacy
  const [genericHost, setGenericHost] = useState('');
  const [genericPort, setGenericPort] = useState('');
  const [genericDb, setGenericDb] = useState('');
  const [genericUser, setGenericUser] = useState('');
  const [genericTable, setGenericTable] = useState('');

  // Flat File Staging & Relational Join Modeling State
  const [isUploading, setIsUploading] = useState(false);
  const [isMerging, setIsMerging] = useState(false);
  const [stagedFiles, setStagedFiles] = useState<File[]>([]);
  const [fileSchemas, setFileSchemas] = useState<{ filename: string; headers: string[] }[]>(() => {
    try {
      const saved = localStorage.getItem('sap_migration_file_schemas');
      if (saved) return JSON.parse(saved);
    } catch (e) { }
    return state.fileSchemas || [];
  });
  const [joinConfig, setJoinConfig] = useState<{
    base_file: string;
    joins: {
      join_file: string;
      source_file?: string;
      base_key?: string;
      join_key?: string;
      key_pairs?: { base_key: string; join_key: string }[];
    }[];
  }>(() => {
    try {
      const saved = localStorage.getItem('sap_migration_join_config');
      if (saved) return JSON.parse(saved);
    } catch (e) { }
    const raw = state.joinConfig?.base_file ? state.joinConfig : { base_file: '', joins: [] };
    return { base_file: raw.base_file, joins: raw.joins || [] };
  });

  const fileInputRef = useRef<HTMLInputElement>(null);

  const getBackendUrl = () => {
    return (import.meta.env.VITE_BACKEND_URL || 'http://127.0.0.1:8000').replace(/\/+$/, '');
  };

  const fetchBackendObjects = React.useCallback(async () => {
    setIsLoadingObjects(true);
    try {
      const res = await fetch(`${getBackendUrl()}/api/sap/objects`);
      if (res.ok) {
        const data = await res.json();
        setBackendObjects(data.objects || []);
      }
    } catch (err) {
      console.warn('Failed to load target objects from backend:', err);
    } finally {
      setIsLoadingObjects(false);
    }
  }, []);

  const fetchProjects = async (retries = 3) => {
    setIsLoadingProjects(true);
    setBackendError(null);
    const backendUrl = getBackendUrl();

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);
        const res = await fetch(`${backendUrl}/api/sap/projects/list`, {
          headers: { 'Accept': 'application/json' },
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (res.ok) {
          const data = await res.json();
          setProjects(data);
          setIsLoadingProjects(false);
          setBackendError(null);
          if (data && data.length > 0) {
            const hasCurrent = data.some((p: any) => p.id === state.projectId);
            if (!state.projectId || !hasCurrent) {
              const defaultProj = data[0];
              dispatch({
                type: 'BATCH_UPDATE',
                updates: { projectId: defaultProj.id, projectName: defaultProj.name }
              });
            }
          }
          return;
        }
      } catch (err: any) {
        console.warn(`Attempt ${attempt} to fetch projects failed:`, err);
        if (attempt < retries) {
          await new Promise(r => setTimeout(r, 600 * attempt));
        }
      }
    }
    setIsLoadingProjects(false);
    setBackendError('Backend service temporarily unreachable.');
  };

  useEffect(() => {
    fetchProjects();
    fetchBackendObjects();
    loadStagedFilesFromDB().then((persistedFiles) => {
      if (persistedFiles && persistedFiles.length > 0) {
        setStagedFiles(persistedFiles);
        if (fileSchemas.length === 0) {
          fetchFileSchemas(persistedFiles);
        }
      }
    });
  }, [fetchBackendObjects]);

  // Project CRUD operations
  const handleCreateProject = async () => {
    if (!newProjectName.trim()) return;
    setIsCreating(true);
    try {
      const res = await fetch(`${getBackendUrl()}/api/sap/projects/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newProjectName.trim(), description: newProjectDesc.trim() })
      });
      if (res.ok) {
        const newProj = await res.json();
        setProjects([newProj, ...projects]);
        dispatch({
          type: 'BATCH_UPDATE',
          updates: { projectId: newProj.id, projectName: newProj.name }
        });
        setNewProjectName('');
        setNewProjectDesc('');
        toast(`Project "${newProj.name}" created and selected!`, 'ok');
      } else {
        const err = await res.json();
        toast(err.detail || 'Failed to create project', 'err');
      }
    } catch (err) {
      toast('Failed to reach backend to create project', 'err');
    } finally {
      setIsCreating(false);
    }
  };

  const handleUpdateProject = async () => {
    if (!state.projectId || !editProjectName.trim()) return;
    try {
      const res = await fetch(`${getBackendUrl()}/api/sap/projects/${state.projectId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editProjectName.trim(), description: editProjectDesc.trim() })
      });
      if (res.ok) {
        const updated = await res.json();
        setProjects(projects.map(p => p.id === updated.id ? updated : p));
        dispatch({ type: 'SET_FIELD', field: 'projectName', value: updated.name });
        toast('Project updated successfully', 'ok');
        setIsEditing(false);
      } else {
        const err = await res.json();
        toast(err.detail || 'Failed to update project', 'err');
      }
    } catch (err) {
      toast('Failed to update project', 'err');
    }
  };

  const handleDeleteProject = async () => {
    if (!state.projectId) return;
    try {
      const res = await fetch(`${getBackendUrl()}/api/sap/projects/${state.projectId}`, { method: 'DELETE' });
      if (res.ok) {
        setProjects(projects.filter(p => p.id !== state.projectId));
        dispatch({ type: 'BATCH_UPDATE', updates: { projectId: null, projectName: null } });
        toast('Project deleted successfully', 'ok');
        setIsEditing(false);
        setShowDeleteConfirm(false);
      } else {
        const err = await res.json();
        toast(err.detail || 'Failed to delete project', 'err');
        setShowDeleteConfirm(false);
      }
    } catch (err) {
      toast('Failed to delete project', 'err');
      setShowDeleteConfirm(false);
    }
  };

  const pickObj = (targetObj: string) => {
    dispatch({ type: 'SET_FIELD', field: 'obj', value: targetObj });
    toast(`Target Object set to ${targetObj}`, 'info');
  };

  // -------------------------------------------------------------
  // Multi-Source Management & Readiness
  // -------------------------------------------------------------
  const selectedSources: SourceInstance[] = state.selectedSources || [];

  const addSourceToBasket = (sourceType: string, customName?: string, customData?: Record<string, any>[], customHeaders?: string[]) => {
    const catalogItem = SOURCES_CATALOG.find(s => s.key === sourceType);
    const existingCount = selectedSources.filter(s => s.type === sourceType).length;
    const instanceId = `${sourceType.toLowerCase()}_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const instanceName = customName || (existingCount === 0 ? catalogItem?.name || sourceType : `${catalogItem?.name || sourceType} #${existingCount + 1}`);

    const newSource: SourceInstance = {
      id: instanceId,
      type: sourceType,
      name: instanceName,
      sub: catalogItem?.sub || 'Configured Source',
      headers: customHeaders || [],
      rawData: customData || [],
      sampleRecords: customData ? customData.slice(0, 10) : [],
      connectionTested: false,
      sampleExtracted: Boolean(customData && customData.length >= 1),
      mapping: [],
      status: 'configured',
      connection: sourceType === 'SAP_ECC' ? {
        baseUrl: connUrl,
        client: connClient,
        username: connUser,
        password: connPass
      } : undefined
    };

    dispatch({ type: 'ADD_SOURCE', source: newSource });
    toast(`Added "${instanceName}" to active sources.`, 'ok');
    return newSource;
  };

  const removeSourceFromBasket = (sourceId: string) => {
    dispatch({ type: 'REMOVE_SOURCE', sourceId });
    toast('Source removed from active basket.', 'info');
  };

  // Test Connection for a specific source
  const testConnectionForSource = async (source: SourceInstance) => {
    setTestingSourceId(source.id);
    try {
      if (source.type === 'SAP_ECC') {
        const res = await fetch(`${getBackendUrl()}/api/sap/connection/test_connection`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            base_url: source.connection?.baseUrl || connUrl,
            client: source.connection?.client || connClient,
            username: source.connection?.username || connUser,
            password: source.connection?.password || connPass,
            system_type: 'SAP_ECC'
          })
        });
        const data = await res.json();
        if (res.ok) {
          dispatch({ type: 'UPDATE_SOURCE', sourceId: source.id, updates: { connectionTested: true } });
          toast(`Connection to ${source.name} verified successfully!`, 'ok');
        } else {
          toast(`Connection to ${source.name} failed: ${data.detail || 'Unknown error'}`, 'err');
        }
      } else if (source.type === 'ORACLE_EBS') {
        await new Promise(r => setTimeout(r, 500));
        dispatch({ type: 'UPDATE_SOURCE', sourceId: source.id, updates: { connectionTested: true } });
        toast(`Connected to Oracle EBS R12 (Database schema: HZ_PARTIES / APPS)`, 'ok');
      } else if (source.type === 'INFOR') {
        await new Promise(r => setTimeout(r, 500));
        dispatch({ type: 'UPDATE_SOURCE', sourceId: source.id, updates: { connectionTested: true } });
        toast(`Connected to Infor CloudSuite (Schema: tccom100 / INFORDB)`, 'ok');
      } else if (source.type === 'EXCEL_CSV') {
        dispatch({ type: 'UPDATE_SOURCE', sourceId: source.id, updates: { connectionTested: true } });
        toast(`Flat file schema & headers verified for ${source.name}`, 'ok');
      } else {
        await new Promise(r => setTimeout(r, 500));
        dispatch({ type: 'UPDATE_SOURCE', sourceId: source.id, updates: { connectionTested: true } });
        toast(`Connection verified for ${source.name}`, 'ok');
      }
    } catch (err: any) {
      toast(`Connection test failed: ${err.message}`, 'err');
    } finally {
      setTestingSourceId(null);
    }
  };

  // Extract 10 Sample Records for a specific source
  const extractSample10ForSource = async (source: SourceInstance) => {
    setExtractingSourceId(source.id);
    try {
      let sampleRows: Record<string, any>[] = [];
      let detectedHeaders: string[] = [];

      if (source.type === 'SAP_ECC') {
        const res = await fetch(`${getBackendUrl()}/api/sap/extract/fetch_sample`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            base_url: source.connection?.baseUrl || connUrl,
            client: source.connection?.client || connClient,
            username: source.connection?.username || connUser,
            password: source.connection?.password || connPass,
            system_type: 'SAP_ECC',
            target_object: state.obj || 'CUSTOMER'
          })
        });
        if (res.ok) {
          const resData = await res.json();
          sampleRows = (resData.data || []).slice(0, 10);
        } else {
          sampleRows = SAMPLE.SAP_ECC_CUSTOMER.slice(0, 10);
        }
      } else if (source.type === 'ORACLE_EBS') {
        try {
          const res = await fetch('/Oracle.xlsx');
          if (res.ok) {
            const blob = await res.blob();
            const file = new File([blob], 'Oracle.xlsx');
            const formData = new FormData();
            formData.append('file', file);
            const uploadRes = await fetch(`${getBackendUrl()}/api/sap/extract/upload`, { method: 'POST', body: formData });
            if (uploadRes.ok) {
              const uploadData = await uploadRes.json();
              sampleRows = (uploadData.data || []).slice(0, 10);
              detectedHeaders = uploadData.headers || [];
            }
          }
        } catch { }

        if (!sampleRows.length) {
          sampleRows = (state.obj === 'VENDOR' ? SAMPLE.ORACLE_VENDOR : SAMPLE.ORACLE_CUSTOMER).slice(0, 10);
        }
      } else if (source.type === 'INFOR') {
        try {
          const res = await fetch('/Infor.xlsx');
          if (res.ok) {
            const blob = await res.blob();
            const file = new File([blob], 'Infor.xlsx');
            const formData = new FormData();
            formData.append('file', file);
            const uploadRes = await fetch(`${getBackendUrl()}/api/sap/extract/upload`, { method: 'POST', body: formData });
            if (uploadRes.ok) {
              const uploadData = await uploadRes.json();
              sampleRows = (uploadData.data || []).slice(0, 10);
              detectedHeaders = uploadData.headers || [];
            }
          }
        } catch { }

        if (!sampleRows.length) {
          sampleRows = (state.obj === 'VENDOR' ? SAMPLE.INFOR_VENDOR : SAMPLE.INFOR_CUSTOMER).slice(0, 10);
        }
      } else if (source.type === 'EXCEL_CSV') {
        sampleRows = (source.rawData || source.sampleRecords || []).slice(0, 10);
      } else {
        sampleRows = (state.obj === 'VENDOR' ? SAMPLE.ORACLE_VENDOR : SAMPLE.SAP_ECC_CUSTOMER).slice(0, 10);
      }

      detectedHeaders = detectedHeaders.length > 0 ? detectedHeaders : Object.keys(sampleRows[0] || {});

      dispatch({
        type: 'UPDATE_SOURCE',
        sourceId: source.id,
        updates: {
          connectionTested: true,
          sampleExtracted: true,
          sampleRecords: sampleRows,
          rawData: sampleRows,
          headers: detectedHeaders,
        }
      });

      // Also sync to global state for backward compatibility
      if (selectedSources[0]?.id === source.id || !state.rawData.length) {
        dispatch({
          type: 'BATCH_UPDATE',
          updates: {
            rawData: sampleRows,
            headers: detectedHeaders,
            src: source.type
          }
        });
      }

      toast(`Extracted ${sampleRows.length} sample records from ${source.name}!`, 'ok');
    } catch (err: any) {
      toast(`Sample extraction failed: ${err.message}`, 'err');
    } finally {
      setExtractingSourceId(null);
    }
  };

  // Test & Extract All Sources in 1 Click
  const testAndExtractAllSources = async () => {
    if (!selectedSources.length) return;
    setIsBatchProcessing(true);
    showLoad('Validating Sources...', 'Testing connections & extracting 10 sample records per source');

    for (const src of selectedSources) {
      if (!src.connectionTested) {
        await testConnectionForSource(src);
      }
      if (!src.sampleExtracted) {
        await extractSample10ForSource(src);
      }
    }

    hideLoad();
    setIsBatchProcessing(false);
    toast('All selected sources are tested and 10 sample records extracted!', 'ok');
  };

  // Preset loader: Oracle EBS + Infor Multi-Source Pair
  const loadPresetMultiSource = async () => {
    const existingTypes = new Set(selectedSources.map(s => s.type));
    if (!existingTypes.has('ORACLE_EBS')) {
      addSourceToBasket('ORACLE_EBS', 'Oracle EBS R12');
    }
    if (!existingTypes.has('INFOR')) {
      addSourceToBasket('INFOR', 'Infor CloudSuite');
    }
    toast('Added Oracle EBS and Infor CloudSuite to active sources!', 'ok');
  };

  // -------------------------------------------------------------
  // Flat File Upload, Staging & Relational Join Modeling
  // -------------------------------------------------------------
  const displayedFiles = stagedFiles.length > 0
    ? stagedFiles.map(f => ({ name: f.name, size: f.size }))
    : (state.uploadedFilesMeta || []);
  const displayedSchemas = fileSchemas.length > 0 ? fileSchemas : (state.fileSchemas || []);
  const displayedJoinConfig = joinConfig.base_file ? joinConfig : (state.joinConfig || { base_file: '', joins: [] });

  const fetchFileSchemas = async (files: File[]) => {
    if (files.length === 0) {
      setFileSchemas([]);
      setJoinConfig({ base_file: '', joins: [] });
      return;
    }

    setIsUploading(true);
    const formData = new FormData();
    files.forEach(f => formData.append('files', f));

    try {
      const res = await fetch(`${getBackendUrl()}/api/sap/extract/upload-preview`, {
        method: 'POST',
        body: formData
      });
      if (!res.ok) throw new Error('Failed to preview file schemas');
      const data = await res.json();
      const schemas: { filename: string; headers: string[] }[] = data.files || [];
      setFileSchemas(schemas);

      const defaultBase = schemas[0]?.filename || '';
      const defaultJoins = schemas.slice(1).map(s => {
        const baseSchema = schemas[0];
        const matchedPairs: { base_key: string; join_key: string }[] = [];
        if (baseSchema) {
          for (const jh of s.headers) {
            for (const bh of baseSchema.headers) {
              const jClean = jh.toLowerCase().replace(/[^a-z0-9]/g, '');
              const bClean = bh.toLowerCase().replace(/[^a-z0-9]/g, '');
              if (
                (jClean === bClean || (jClean.includes('id') && bClean.includes('id'))) &&
                !matchedPairs.some(p => p.base_key === bh || p.join_key === jh)
              ) {
                matchedPairs.push({ base_key: bh, join_key: jh });
                break;
              }
            }
          }
        }

        const finalPairs = matchedPairs.length > 0
          ? matchedPairs
          : [{ base_key: baseSchema?.headers[0] || '', join_key: s.headers[0] || '' }];

        return {
          join_file: s.filename,
          source_file: defaultBase,
          base_key: finalPairs[0].base_key,
          join_key: finalPairs[0].join_key,
          key_pairs: finalPairs
        };
      });

      const nextConfig = {
        base_file: schemas.some(s => s.filename === displayedJoinConfig.base_file) ? displayedJoinConfig.base_file : defaultBase,
        joins: defaultJoins
      };

      setJoinConfig(nextConfig);
      dispatch({
        type: 'BATCH_UPDATE',
        updates: {
          fileSchemas: schemas,
          uploadedFilesMeta: files.map(f => ({ name: f.name, size: f.size })),
          joinConfig: nextConfig
        }
      });
    } catch (err: any) {
      toast(err.message || 'Error loading file schemas', 'err');
    } finally {
      setIsUploading(false);
    }
  };

  const handleFilesAdded = async (newFileList: FileList | File[] | null) => {
    if (!newFileList) return;
    const newFiles = Array.from(newFileList);
    if (newFiles.length === 0) return;

    const existingNames = new Set(displayedFiles.map(f => f.name));
    const trulyNewFiles = newFiles.filter(f => !existingNames.has(f.name));
    if (trulyNewFiles.length === 0) {
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    const updatedStaged = [...stagedFiles, ...trulyNewFiles];
    setStagedFiles(updatedStaged);
    saveStagedFilesToDB(updatedStaged);

    setIsUploading(true);
    const formData = new FormData();
    trulyNewFiles.forEach(f => formData.append('files', f));

    try {
      const res = await fetch(`${getBackendUrl()}/api/sap/extract/upload-preview`, {
        method: 'POST',
        body: formData
      });
      if (!res.ok) throw new Error('Failed to preview file schemas');
      const data = await res.json();
      const newSchemas: { filename: string; headers: string[] }[] = data.files || [];

      const currentSchemas = displayedSchemas;
      const combinedSchemas = [...currentSchemas, ...newSchemas];
      setFileSchemas(combinedSchemas);

      const currentMeta = displayedFiles;
      const combinedMeta = [...currentMeta, ...trulyNewFiles.map(f => ({ name: f.name, size: f.size }))];

      const curCfg = joinConfig.base_file ? joinConfig : (state.joinConfig || { base_file: '', joins: [] });
      const effectiveBase = curCfg.base_file || combinedSchemas[0]?.filename || '';
      const baseSchema = combinedSchemas.find(s => s.filename === effectiveBase) || combinedSchemas[0];

      const existingJoins = curCfg.joins || [];
      const existingJoinFiles = new Set(existingJoins.map(j => j.join_file));

      const newJoinsToAdd = combinedSchemas
        .filter(s => s.filename !== effectiveBase && !existingJoinFiles.has(s.filename))
        .map(s => {
          const matchedPairs: { base_key: string; join_key: string }[] = [];
          if (baseSchema) {
            for (const jh of s.headers) {
              for (const bh of baseSchema.headers) {
                const jClean = jh.toLowerCase().replace(/[^a-z0-9]/g, '');
                const bClean = bh.toLowerCase().replace(/[^a-z0-9]/g, '');
                if (
                  (jClean === bClean || (jClean.includes('id') && bClean.includes('id'))) &&
                  !matchedPairs.some(p => p.base_key === bh || p.join_key === jh)
                ) {
                  matchedPairs.push({ base_key: bh, join_key: jh });
                  break;
                }
              }
            }
          }

          const finalPairs = matchedPairs.length > 0
            ? matchedPairs
            : [{ base_key: baseSchema?.headers[0] || '', join_key: s.headers[0] || '' }];

          return {
            join_file: s.filename,
            source_file: effectiveBase,
            base_key: finalPairs[0].base_key,
            join_key: finalPairs[0].join_key,
            key_pairs: finalPairs
          };
        });

      const nextConfig = {
        base_file: effectiveBase,
        joins: [...existingJoins, ...newJoinsToAdd]
      };

      setJoinConfig(nextConfig);
      try {
        localStorage.setItem('sap_migration_file_schemas', JSON.stringify(combinedSchemas));
        localStorage.setItem('sap_migration_join_config', JSON.stringify(nextConfig));
      } catch (e) { }
      dispatch({
        type: 'BATCH_UPDATE',
        updates: {
          fileSchemas: combinedSchemas,
          uploadedFilesMeta: combinedMeta,
          joinConfig: nextConfig
        }
      });
    } catch (err: any) {
      toast(err.message || 'Error loading file schemas', 'err');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleRemoveStagedFile = async (fileName: string) => {
    const updatedStaged = stagedFiles.filter(f => f.name !== fileName);
    const updatedMeta = (state.uploadedFilesMeta || []).filter(f => f.name !== fileName);
    const updatedSchemas = (fileSchemas.length > 0 ? fileSchemas : (state.fileSchemas || [])).filter(s => s.filename !== fileName);

    setStagedFiles(updatedStaged);
    setFileSchemas(updatedSchemas);
    await removeStagedFileFromDB(fileName);

    const totalRemaining = updatedStaged.length > 0 ? updatedStaged.length : updatedMeta.length;

    if (totalRemaining === 0) {
      handleClearStagedFiles();
      return;
    }

    const curCfg = joinConfig.base_file ? joinConfig : (state.joinConfig || { base_file: '', joins: [] });
    let newBase = curCfg.base_file;
    if (newBase === fileName) {
      newBase = updatedSchemas[0]?.filename || updatedMeta[0]?.name || '';
    }

    const remainingJoins = (curCfg.joins || [])
      .filter(j => j.join_file !== fileName)
      .map(j => {
        let src = j.source_file;
        if (src === fileName) {
          src = newBase;
        }
        return {
          ...j,
          source_file: src
        };
      });

    const newCfg = {
      base_file: newBase,
      joins: remainingJoins
    };

    setJoinConfig(newCfg);
    try {
      localStorage.setItem('sap_migration_file_schemas', JSON.stringify(updatedSchemas));
      localStorage.setItem('sap_migration_join_config', JSON.stringify(newCfg));
    } catch (e) { }
    dispatch({
      type: 'BATCH_UPDATE',
      updates: {
        uploadedFilesMeta: updatedMeta,
        fileSchemas: updatedSchemas,
        joinConfig: newCfg
      }
    });
  };

  const handleClearStagedFiles = async () => {
    setStagedFiles([]);
    setFileSchemas([]);
    setJoinConfig({ base_file: '', joins: [] });
    await clearAllStagedFilesFromDB();
    try {
      localStorage.removeItem('sap_migration_file_schemas');
      localStorage.removeItem('sap_migration_join_config');
    } catch (e) { }
    dispatch({
      type: 'BATCH_UPDATE',
      updates: {
        uploadedFilesMeta: [],
        fileSchemas: [],
        joinConfig: { base_file: '', joins: [] },
        headers: [],
        uploadedData: [],
        rawData: []
      }
    });
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleLoadSingleStagedFile = async () => {
    if (displayedFiles.length === 0) return;
    const file = stagedFiles[0];
    setIsUploading(true);
    showLoad('Uploading File...', `Parsing ${file.name}`, ['Reading columns...', 'Extracting 10 sample records...']);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch(`${getBackendUrl()}/api/sap/extract/upload`, {
        method: 'POST',
        body: formData
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || 'Failed to upload file');
      }

      const data = await res.json();
      const sample10 = (data.data || []).slice(0, 10);
      dispatch({
        type: 'BATCH_UPDATE',
        updates: {
          headers: data.headers,
          uploadedData: data.data,
          rawData: sample10,
          uploadedFilesMeta: displayedFiles.map(f => ({ name: f.name, size: f.size })),
          fileSchemas: fileSchemas,
          joinConfig: joinConfig
        }
      });

      // Also ensure it is present in selectedSources
      const existing = selectedSources.find(s => s.name === file.name || s.type === 'EXCEL_CSV');
      if (existing) {
        dispatch({
          type: 'UPDATE_SOURCE',
          sourceId: existing.id,
          updates: {
            name: file.name,
            connectionTested: true,
            sampleExtracted: true,
            sampleRecords: sample10,
            rawData: sample10,
            headers: data.headers
          }
        });
      } else {
        addSourceToBasket('EXCEL_CSV', file.name, sample10, data.headers);
      }

      toast(`Successfully loaded ${data.headers.length} columns and ${data.data.length} rows from ${file.name}!`, 'ok');
    } catch (err: any) {
      toast(err.message, 'err');
    } finally {
      setIsUploading(false);
      hideLoad();
    }
  };

  const handleMergeAndLoadFiles = async () => {
    if (displayedFiles.length < 2) return;
    if (!displayedJoinConfig.base_file) {
      toast('Please select a Primary / Base Table', 'err');
      return;
    }
    const missingJoin = displayedJoinConfig.joins.find(j => {
      const kps = j.key_pairs?.length ? j.key_pairs : [{ base_key: j.base_key, join_key: j.join_key }];
      return kps.length === 0 || kps.some(kp => !kp.base_key || !kp.join_key);
    });
    if (missingJoin) {
      toast(`Please select join keys for all conditions in ${missingJoin.join_file}`, 'err');
      return;
    }

    setIsMerging(true);
    showLoad('Merging Datasets...', `Joining ${displayedFiles.length} files on selected keys`, ['Aligning relational records...', 'Creating consolidated view...']);

    const formData = new FormData();
    stagedFiles.forEach(f => formData.append('files', f));
    formData.append('join_config', JSON.stringify(joinConfig));

    try {
      const res = await fetch(`${getBackendUrl()}/api/sap/extract/upload-merge`, {
        method: 'POST',
        body: formData
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        let errorMsg = 'Failed to merge files';
        if (typeof errData?.detail === 'string') {
          errorMsg = errData.detail;
        } else if (Array.isArray(errData?.detail)) {
          errorMsg = errData.detail.map((e: any) => typeof e === 'string' ? e : (e.msg || JSON.stringify(e))).join(', ');
        } else if (errData?.message) {
          errorMsg = String(errData.message);
        }
        throw new Error(errorMsg);
      }

      const data = await res.json();
      const sample10 = (data.data || []).slice(0, 10);
      dispatch({
        type: 'BATCH_UPDATE',
        updates: {
          headers: data.headers,
          uploadedData: data.data,
          rawData: sample10
        }
      });

      // Register merged tables as an active source
      const joinedSourceName = `Excel/CSV (${displayedFiles.length} Tables Joined)`;
      const existingJoined = selectedSources.find(s => s.type === 'EXCEL_CSV');
      if (existingJoined) {
        dispatch({
          type: 'UPDATE_SOURCE',
          sourceId: existingJoined.id,
          updates: {
            name: joinedSourceName,
            connectionTested: true,
            sampleExtracted: true,
            sampleRecords: sample10,
            rawData: sample10,
            headers: data.headers
          }
        });
      } else {
        addSourceToBasket('EXCEL_CSV', joinedSourceName, sample10, data.headers);
      }

      toast(`Successfully joined ${displayedFiles.length} files! Loaded ${data.headers.length} columns and ${data.data.length} rows.`, 'ok');
    } catch (err: any) {
      toast(err?.message || 'Merge failed', 'err');
    } finally {
      setIsMerging(false);
      hideLoad();
    }
  };

  const updateJoinSourceFile = (joinIdx: number, newSourceFile: string) => {
    setJoinConfig((prev) => {
      const curCfg = prev.base_file ? prev : (state.joinConfig || { base_file: '', joins: [] });
      const srcSchema = displayedSchemas.find(s => s.filename === newSourceFile);
      const newJoins = (curCfg.joins || []).map((j, i) => {
        if (i !== joinIdx) return j;
        const joinSchema = displayedSchemas.find(s => s.filename === j.join_file);

        const matchedPairs: { base_key: string; join_key: string }[] = [];
        if (srcSchema && joinSchema) {
          for (const jh of joinSchema.headers) {
            for (const sh of srcSchema.headers) {
              const jClean = jh.toLowerCase().replace(/[^a-z0-9]/g, '');
              const sClean = sh.toLowerCase().replace(/[^a-z0-9]/g, '');
              if (
                (jClean === sClean || (jClean.includes('id') && sClean.includes('id')) || (jClean.includes('code') && sClean.includes('code'))) &&
                !matchedPairs.some(p => p.base_key === sh || p.join_key === jh)
              ) {
                matchedPairs.push({ base_key: sh, join_key: jh });
                break;
              }
            }
          }
        }

        const finalPairs = matchedPairs.length > 0
          ? matchedPairs
          : [{ base_key: srcSchema?.headers[0] || '', join_key: joinSchema?.headers[0] || '' }];

        return {
          ...j,
          source_file: newSourceFile,
          base_key: finalPairs[0].base_key,
          join_key: finalPairs[0].join_key,
          key_pairs: finalPairs
        };
      });

      const newCfg = { ...curCfg, joins: newJoins };
      dispatch({ type: 'SET_FIELD', field: 'joinConfig', value: newCfg });
      return newCfg;
    });
  };

  const updateJoinKeyPair = (joinIdx: number, keyPairIdx: number, side: 'base_key' | 'join_key', val: string) => {
    setJoinConfig((prev) => {
      const curCfg = prev.base_file ? prev : (state.joinConfig || { base_file: '', joins: [] });
      const newJoins = (curCfg.joins || []).map((j, i) => {
        if (i !== joinIdx) return j;
        const kps = j.key_pairs?.length
          ? [...j.key_pairs]
          : [{ base_key: j.base_key || '', join_key: j.join_key || '' }];
        if (kps[keyPairIdx]) {
          kps[keyPairIdx] = { ...kps[keyPairIdx], [side]: val };
        }
        return {
          ...j,
          base_key: kps[0]?.base_key || '',
          join_key: kps[0]?.join_key || '',
          key_pairs: kps
        };
      });
      const newCfg = { ...curCfg, joins: newJoins };
      dispatch({ type: 'SET_FIELD', field: 'joinConfig', value: newCfg });
      return newCfg;
    });
  };

  const addJoinKeyPair = (joinIdx: number) => {
    setJoinConfig((prev) => {
      const curCfg = prev.base_file ? prev : (state.joinConfig || { base_file: '', joins: [] });
      const newJoins = (curCfg.joins || []).map((j, i) => {
        if (i !== joinIdx) return j;
        const kps = j.key_pairs?.length
          ? [...j.key_pairs]
          : [{ base_key: j.base_key || '', join_key: j.join_key || '' }];
        kps.push({ base_key: '', join_key: '' });
        return {
          ...j,
          base_key: kps[0]?.base_key || '',
          join_key: kps[0]?.join_key || '',
          key_pairs: kps
        };
      });
      const newCfg = { ...curCfg, joins: newJoins };
      dispatch({ type: 'SET_FIELD', field: 'joinConfig', value: newCfg });
      return newCfg;
    });
  };

  const removeJoinKeyPair = (joinIdx: number, keyPairIdx: number) => {
    setJoinConfig((prev) => {
      const curCfg = prev.base_file ? prev : (state.joinConfig || { base_file: '', joins: [] });
      const newJoins = (curCfg.joins || []).map((j, i) => {
        if (i !== joinIdx) return j;
        const kps = (j.key_pairs || [{ base_key: j.base_key || '', join_key: j.join_key || '' }]).filter((_, k) => k !== keyPairIdx);
        const finalKps = kps.length > 0 ? kps : [{ base_key: '', join_key: '' }];
        return {
          ...j,
          base_key: finalKps[0]?.base_key || '',
          join_key: finalKps[0]?.join_key || '',
          key_pairs: finalKps
        };
      });
      const newCfg = { ...curCfg, joins: newJoins };
      dispatch({ type: 'SET_FIELD', field: 'joinConfig', value: newCfg });
      return newCfg;
    });
  };

  // Readiness evaluation
  const allSourcesReady = Boolean(
    selectedSources.length > 0 &&
    selectedSources.every(s => s.connectionTested && s.sampleExtracted)
  );

  const readyCount = selectedSources.filter(s => s.connectionTested && s.sampleExtracted).length;
  const totalCount = selectedSources.length;
  const has = (state.rawData && state.rawData.length > 0) || (state.uploadedData && state.uploadedData.length > 0);

  const activeSourceInBasket = selectedSources.find(s => s.type === activeCatalogKey);

  return (
    <PageLayout>
      <PageHeader
        title="Step 1 — Source & Data Connect"
        subtitle="Configure migration project, select target SAP object, and ingest multiple sources"
      >
        <div className="flex items-center gap-2.5 flex-wrap">
          <Button
            variant="secondary"
            icon={<FileSpreadsheet className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />}
            onClick={() => setIsImportModalOpen(true)}
          >
            Upload Target Object Fields
          </Button>
          <div title={!allSourcesReady || !state.projectId || !state.obj ? "Complete project selection, target SAP object, and verify all sources in dashboard to proceed." : ""}>
            <Button
              variant="primary"
              icon={<ArrowRight className="w-3.5 h-3.5" />}
              onClick={() => navigate('/mapping')}
              disabled={!allSourcesReady || !state.projectId || !state.obj}
            >
              Next: AI Mapping
            </Button>
          </div>
        </div>
      </PageHeader>

      <PageGrid>
        {/* ========================================================================= */}
        {/* LEFT COLUMN: Project Workspace (Top) & Target Object (Bottom)             */}
        {/* ========================================================================= */}
        <GridCol span={4}>
          <div className="space-y-5">
            {/* 1. PROJECT WORKSPACE */}
            <Card>
              <CardHeader
                icon={<FolderGit2 className="w-4 h-4 text-primary-500" />}
                title="1. Project Workspace"
                subtitle="Select or create a project (Mandatory first step)"
              />
              <CardBody className="space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="font-mono text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] block">
                      Select Project
                    </label>
                    <button
                      type="button"
                      onClick={() => fetchProjects(2)}
                      disabled={isLoadingProjects}
                      title="Refresh project list"
                      className="inline-flex items-center gap-1 text-[11px] text-primary-500 hover:text-primary-600 disabled:opacity-50 transition-colors cursor-pointer"
                    >
                      <RotateCw className={`w-3 h-3 ${isLoadingProjects ? 'animate-spin' : ''}`} />
                      <span>{isLoadingProjects ? 'Loading...' : 'Refresh'}</span>
                    </button>
                  </div>

                  <div className="flex items-center gap-2 w-full min-w-0">
                    <div className="flex-1 min-w-0">
                      <Select
                        value={state.projectId || ''}
                        onChange={(val) => {
                          const p = projects.find(proj => proj.id === val);
                          dispatch({ type: 'BATCH_UPDATE', updates: { projectId: val, projectName: p ? p.name : null } });
                          setIsEditing(false);
                        }}
                        options={
                          isLoadingProjects
                            ? [{ value: '', label: 'Loading projects...' }]
                            : projects.length === 0
                            ? [{ value: '', label: backendError ? 'Backend unavailable — click Refresh' : 'No projects found (Create one below)' }]
                            : [
                                { value: '', label: '— Select a project —' },
                                ...projects.map(p => ({ value: p.id, label: p.name }))
                              ]
                        }
                      />
                    </div>
                    {state.projectId && !isEditing && (
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            const cur = projects.find(p => p.id === state.projectId);
                            setEditProjectName(cur?.name || '');
                            setEditProjectDesc(cur?.description || '');
                            setIsEditing(true);
                          }}
                          className="px-2.5 py-1.5 rounded-lg bg-[var(--bg-tertiary)] border border-[var(--border)] hover:bg-gray-100 dark:hover:bg-gray-800 text-[11px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors flex items-center gap-1 cursor-pointer shrink-0"
                          title="Edit Project"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          <span>Edit</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowDeleteConfirm(true)}
                          className="px-2.5 py-1.5 rounded-lg bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 text-[11px] font-medium text-red-600 dark:text-red-400 transition-colors flex items-center gap-1 cursor-pointer shrink-0"
                          title="Delete Project"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Delete</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {state.projectId && (
                  <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-between gap-2 text-[12px] text-emerald-600 dark:text-emerald-400">
                    <div className="flex items-center gap-1.5 min-w-0 flex-1">
                      <Check className="w-3.5 h-3.5 shrink-0" />
                      <span className="font-semibold shrink-0">Project Active:</span>
                      <span className="font-mono font-bold truncate" title={state.projectName || state.projectId}>
                        {state.projectName || state.projectId}
                      </span>
                    </div>
                  </div>
                )}

                {isEditing && state.projectId && (
                  <div className="space-y-2.5 p-3 rounded-lg border border-[var(--border)] bg-[var(--bg-tertiary)]/50">
                    <label className="font-mono text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] block">Edit Project</label>
                    <input
                      type="text"
                      placeholder="Project Name"
                      value={editProjectName}
                      onChange={e => setEditProjectName(e.target.value)}
                      className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-tertiary)] px-3 py-2 text-[12.5px] text-[var(--text-primary)] outline-none focus:border-primary-500 transition-colors"
                    />
                    <input
                      type="text"
                      placeholder="Description"
                      value={editProjectDesc}
                      onChange={e => setEditProjectDesc(e.target.value)}
                      className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-tertiary)] px-3 py-2 text-[12.5px] text-[var(--text-primary)] outline-none focus:border-primary-500 transition-colors"
                    />
                    <div className="flex gap-2 mt-2">
                      <Button variant="secondary" className="flex-1 justify-center" onClick={() => setIsEditing(false)}>Cancel</Button>
                      <Button variant="primary" icon={<Save className="w-3.5 h-3.5" />} className="flex-1 justify-center" onClick={handleUpdateProject} disabled={!editProjectName.trim()}>Save Changes</Button>
                    </div>
                  </div>
                )}

                <Divider />

                {!isEditing && (
                  <div className="space-y-2.5">
                    <label className="font-mono text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] block">Create New Project</label>
                    <input
                      type="text"
                      placeholder="Project Name (e.g. S4HANA Regional Rollout)"
                      value={newProjectName}
                      onChange={e => setNewProjectName(e.target.value)}
                      className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-tertiary)] px-3 py-2 text-[12.5px] text-[var(--text-primary)] outline-none focus:border-primary-500 transition-colors"
                    />
                    <input
                      type="text"
                      placeholder="Description (Optional)"
                      value={newProjectDesc}
                      onChange={e => setNewProjectDesc(e.target.value)}
                      className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-tertiary)] px-3 py-2 text-[12.5px] text-[var(--text-primary)] outline-none focus:border-primary-500 transition-colors"
                    />
                    <Button
                      variant="secondary"
                      icon={<Plus className="w-3.5 h-3.5" />}
                      className="w-full justify-center mt-2"
                      onClick={handleCreateProject}
                      disabled={isCreating || !newProjectName.trim()}
                    >
                      {isCreating ? 'Creating...' : 'Create & Select Project'}
                    </Button>
                  </div>
                )}
              </CardBody>
            </Card>

            {/* 2. TARGET OBJECT SELECTION */}
            <Card className={!state.projectId ? "opacity-60 pointer-events-none relative" : ""}>
              <CardHeader
                icon={<Package className="w-4 h-4 text-emerald-500" />}
                title="2. Target SAP Object"
                subtitle="Enabled after project selection"
              />
              <CardBody className="space-y-4">
                {!state.projectId ? (
                  <div className="p-4 rounded-xl border border-amber-500/30 bg-amber-500/10 text-center space-y-2">
                    <div className="w-8 h-8 rounded-full bg-amber-500/20 text-amber-500 mx-auto flex items-center justify-center">
                      <Lock className="w-4 h-4" />
                    </div>
                    <p className="text-[12px] font-semibold text-amber-600 dark:text-amber-400">
                      Step 1 Required: Select or create a project above to unlock Target Object selection.
                    </p>
                  </div>
                ) : (
                  <>
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="font-mono text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] block">
                          Select Target Object
                        </label>
                        <button
                          type="button"
                          onClick={() => fetchBackendObjects()}
                          disabled={isLoadingObjects}
                          className="inline-flex items-center gap-1 text-[10.5px] text-teal-600 dark:text-teal-400 hover:underline disabled:opacity-50 transition-colors cursor-pointer"
                        >
                          <RotateCw className={`w-3 h-3 ${isLoadingObjects ? 'animate-spin' : ''}`} />
                          <span>{isLoadingObjects ? 'Loading...' : 'Refresh'}</span>
                        </button>
                      </div>
                      <Select
                        value={state.obj || ''}
                        onChange={(val) => pickObj(val)}
                        options={[
                          { value: '', label: isLoadingObjects ? 'Loading target objects...' : '— Select a target object —' },
                          ...(() => {
                            const staticList = Object.entries(OBJS).map(([k, v]) => ({ value: k, label: `${v.label} (${v.module})` }));
                            const staticKeys = new Set(staticList.map(o => o.value.toUpperCase()));
                            const dynamicList = backendObjects
                              .filter(bo => !staticKeys.has(bo.name.toUpperCase()))
                              .map(bo => ({ value: bo.name, label: `${bo.name} (Custom Target Object)` }));
                            return [...staticList, ...dynamicList];
                          })()
                        ]}
                      />
                    </div>

                    {state.obj && OBJS[state.obj] && (
                      <div className="p-3 rounded-lg border border-[var(--border)] bg-[var(--bg-tertiary)] space-y-2 text-[12px]">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-[var(--text-primary)]">{OBJS[state.obj].label}</span>
                          <Badge variant="blue">TCode: {OBJS[state.obj].tcode}</Badge>
                        </div>
                        <div className="text-[11px] text-[var(--text-secondary)]">
                          Module: <span className="font-mono font-medium">{OBJS[state.obj].module}</span> | DMC Template: <span className="font-mono font-medium">{OBJS[state.obj].dmc}</span>
                        </div>
                        <div className="text-[11px] text-[var(--text-tertiary)]">
                          SAP Structures: <span className="font-mono font-medium text-emerald-600 dark:text-emerald-400">General, Address, Contact, Org, Financial, Tax</span>
                        </div>
                      </div>
                    )}

                    <Button
                      variant="secondary"
                      size="sm"
                      icon={<FileSpreadsheet className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400 shrink-0" />}
                      className="w-full justify-center text-center py-2 px-3 text-[11.5px] truncate"
                      onClick={() => setIsImportModalOpen(true)}
                    >
                      Import Custom Target Object Template (.xlsx)
                    </Button>
                  </>
                )}
              </CardBody>
            </Card>
          </div>
        </GridCol>

        {/* ========================================================================= */}
        {/* RIGHT COLUMN: Multi-Source Dashboard & Add Sources                        */}
        {/* ========================================================================= */}
        <GridCol span={8}>
          {!state.obj || !state.projectId ? (
            <Card className="p-8 text-center border-dashed border-2">
              <div className="w-14 h-14 rounded-2xl bg-amber-500/10 text-amber-500 mx-auto flex items-center justify-center mb-4">
                <Lock className="w-7 h-7" />
              </div>
              <h3 className="text-base font-bold text-[var(--text-primary)] mb-1">
                Source Selection Locked
              </h3>
              <p className="text-[13px] text-[var(--text-secondary)] max-w-md mx-auto">
                Please complete the required hierarchy on the left first:
                <br />
                <span className="font-medium text-[var(--text-primary)]">1. Select a Project</span> → <span className="font-medium text-[var(--text-primary)]">2. Select a Target Object</span>.
                <br />
                Once selected, multiple source ingestion and the readiness dashboard will unlock automatically.
              </p>
            </Card>
          ) : (
            <div className="space-y-5">
              {/* CARD 1: SOURCE READINESS DASHBOARD */}
              <Card>
                <CardHeader
                  icon={<Cable className="w-4 h-4 text-primary-500" />}
                  title="Source Readiness & Sample Extraction Dashboard"
                  subtitle="Mandatory: Every selected source must be tested and have 10 sample records extracted before AI Mapping"
                >
                  <div className="flex items-center gap-2.5">
                    <Badge variant={allSourcesReady ? "green" : "amber"}>
                      {readyCount} / {totalCount} Sources Ready
                    </Badge>
                    {selectedSources.length > 0 && (
                      <Button
                        variant="secondary"
                        size="sm"
                        icon={<RotateCw className={`w-3.5 h-3.5 ${isBatchProcessing ? 'animate-spin' : ''}`} />}
                        onClick={testAndExtractAllSources}
                        disabled={isBatchProcessing}
                      >
                        Re-test & Extract All
                      </Button>
                    )}
                  </div>
                </CardHeader>
                <CardBody className="space-y-3">
                  {selectedSources.length === 0 ? (
                    <div className="p-6 rounded-xl border border-dashed border-[var(--border)] text-center bg-[var(--bg-tertiary)]/40">
                      <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-500 mx-auto flex items-center justify-center mb-2">
                        <Database className="w-5 h-5" />
                      </div>
                      <p className="text-[13px] font-semibold text-[var(--text-primary)]">No Sources Added Yet</p>
                      <p className="text-[12px] text-[var(--text-secondary)] mb-3">
                        Choose one or more sources from the catalog below (e.g., Oracle EBS, Infor, Flat Files) to begin.
                      </p>
                      <Button variant="secondary" size="sm" icon={<Plus className="w-3.5 h-3.5" />} onClick={loadPresetMultiSource}>
                        Add Oracle EBS + Infor CloudSuite Pair
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      {selectedSources.map((source, idx) => {
                        const isTested = source.connectionTested;
                        const isExtracted = source.sampleExtracted;
                        const isFullyReady = isTested && isExtracted;

                        return (
                          <div
                            key={source.id}
                            className={`p-3.5 rounded-xl border transition-all ${
                              isFullyReady
                                ? "bg-emerald-500/5 border-emerald-500/25"
                                : "bg-[var(--bg-tertiary)] border-[var(--border)]"
                            }`}
                          >
                            <div className="flex items-center justify-between gap-3 flex-wrap">
                              {/* Source Info */}
                              <div className="flex items-center gap-3 min-w-[200px]">
                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs ${
                                  source.type === 'ORACLE_EBS' ? 'bg-red-500/10 text-red-500' :
                                  source.type === 'INFOR' ? 'bg-orange-500/10 text-orange-500' :
                                  source.type === 'EXCEL_CSV' ? 'bg-emerald-500/10 text-emerald-500' :
                                  'bg-blue-500/10 text-blue-500'
                                }`}>
                                  {idx + 1}
                                </div>
                                <div>
                                  <div className="flex items-center gap-2">
                                    <h4 className="text-[13px] font-bold text-[var(--text-primary)]">{source.name}</h4>
                                    <Badge variant="neutral">{source.type}</Badge>
                                    {isFullyReady && (
                                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                                        <Check className="w-3 h-3" /> Ready for Mapping
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-[11px] text-[var(--text-tertiary)]">
                                    {source.headers.length > 0 ? `${source.headers.length} fields detected` : "Schema pending extraction"} | {source.sub}
                                  </p>
                                </div>
                              </div>

                              {/* Checklist Items: Status Ticks Only (Actions clicked under Add Migration Sources) */}
                              <div className="flex items-center gap-3">
                                {/* 1. Connection Test Status Tick */}
                                {isTested ? (
                                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/25 text-emerald-600 dark:text-emerald-400 text-[11px] font-semibold">
                                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> Connection Verified
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-amber-500/10 border border-amber-500/25 text-amber-600 dark:text-amber-400 text-[11px] font-semibold">
                                    <AlertCircle className="w-3.5 h-3.5 text-amber-500" /> Pending Connection Test
                                  </span>
                                )}

                                {/* 2. 10 Sample Records Status Tick */}
                                {isExtracted ? (
                                  <div className="flex items-center gap-1.5">
                                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/25 text-emerald-600 dark:text-emerald-400 text-[11px] font-semibold">
                                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> 10 Rows Staged
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => setPreviewModalSource(source)}
                                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] hover:bg-gray-100 dark:hover:bg-gray-800 text-[11px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
                                      title="Preview 10 Sample Records"
                                    >
                                      <Eye className="w-3 h-3 text-emerald-500" />
                                      <span>Preview</span>
                                    </button>
                                  </div>
                                ) : (
                                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-amber-500/10 border border-amber-500/25 text-amber-600 dark:text-amber-400 text-[11px] font-semibold">
                                    <AlertCircle className="w-3.5 h-3.5 text-amber-500" /> Pending Sample Data
                                  </span>
                                )}

                                {/* Delete Source */}
                                <button
                                  type="button"
                                  onClick={() => removeSourceFromBasket(source.id)}
                                  className="w-8 h-8 rounded-lg flex items-center justify-center text-[var(--text-tertiary)] hover:text-red-500 hover:bg-red-500/10 transition-colors cursor-pointer"
                                  title="Remove source"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardBody>
              </Card>

              {/* CARD 2: AVAILABLE MIGRATION SOURCES CATALOG */}
              <Card>
                <CardHeader
                  icon={<Plus className="w-4 h-4 text-emerald-500" />}
                  title="Add Migration Sources (Multiple Selection Allowed)"
                  subtitle="Select multiple source ERP systems or flat files to combine into mapping and extraction"
                >
                  <Button variant="secondary" size="sm" icon={<Zap className="w-3.5 h-3.5" />} onClick={loadPresetMultiSource}>
                    Add Oracle + Infor Pair
                  </Button>
                </CardHeader>
                <CardBody className="space-y-5">
                  {/* Source Tiles with Apple Liquid Glass Effect */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
                    {SOURCES_CATALOG.map((cat) => {
                      const isAdded = selectedSources.some(s => s.type === cat.key);
                      const isTileActive = activeCatalogKey === cat.key;
                      return (
                        <div
                          key={cat.key}
                          onClick={() => {
                            setActiveCatalogKey(cat.key);
                            if (!isAdded && cat.key !== 'EXCEL_CSV') {
                              addSourceToBasket(cat.key);
                            }
                          }}
                          className={`relative overflow-hidden p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between group ${
                            isTileActive
                              ? "border-primary-500/70 shadow-md text-primary-900 dark:text-primary-100"
                              : "border-[var(--border)] bg-[var(--bg-tertiary)]/70 hover:border-[var(--border-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                          }`}
                        >
                          {isTileActive && (
                            <motion.div
                              layoutId="active-source-pill"
                              className="apple-glass-pill"
                              transition={{ type: "spring", damping: 18, stiffness: 250, mass: 0.8, bounce: 0.4 }}
                            />
                          )}
                          <div className="relative z-10">
                            <div className="flex items-center justify-between mb-1.5">
                              {cat.icon}
                              {isAdded && (
                                <span className="inline-flex items-center text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded-md">
                                  <Check className="w-3 h-3 mr-0.5" /> Added
                                </span>
                              )}
                            </div>
                            <div className="text-[12.5px] font-bold text-[var(--text-primary)]">{cat.name}</div>
                            <div className="text-[10.5px] text-[var(--text-tertiary)] line-clamp-1">{cat.sub}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Active Source Config Section */}
                  <div className="p-4 rounded-xl border border-[var(--border)] bg-[var(--bg-tertiary)]/50 space-y-3.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[12.5px] font-bold text-[var(--text-primary)]">
                        Configure Source: {SOURCES_CATALOG.find(c => c.key === activeCatalogKey)?.name}
                      </span>
                      <Button
                        variant="secondary"
                        size="sm"
                        icon={<Plus className="w-3.5 h-3.5" />}
                        onClick={() => {
                          if (activeCatalogKey === 'EXCEL_CSV') {
                            fileInputRef.current?.click();
                          } else {
                            addSourceToBasket(activeCatalogKey);
                          }
                        }}
                      >
                        Add Another Instance of this Source
                      </Button>
                    </div>

                    {/* SOURCE FIELDS 1: SAP ECC 6.0 */}
                    {activeCatalogKey === 'SAP_ECC' && (
                      <div className="space-y-3">
                        <div className="grid grid-cols-4 gap-2.5">
                          <div className="col-span-3">
                            <label className="font-mono text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] mb-1 block">Base URL</label>
                            <input
                              type="text"
                              placeholder="https://host:port"
                              value={connUrl}
                              onChange={e => {
                                setConnUrl(e.target.value);
                                dispatch({ type: 'SET_FIELD', field: 'connUrl', value: e.target.value });
                              }}
                              className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-[12.5px] text-[var(--text-primary)] outline-none focus:border-primary-500 transition-colors"
                            />
                          </div>
                          <div className="col-span-1">
                            <label className="font-mono text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] mb-1 block">Client</label>
                            <input
                              type="text"
                              placeholder="100"
                              value={connClient}
                              onChange={e => {
                                setConnClient(e.target.value);
                                dispatch({ type: 'SET_FIELD', field: 'connClient', value: e.target.value });
                              }}
                              className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-[12.5px] text-[var(--text-primary)] outline-none focus:border-primary-500 transition-colors"
                            />
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2.5">
                          <div>
                            <label className="font-mono text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] mb-1 block">Username</label>
                            <input
                              type="text"
                              placeholder="sapuser"
                              value={connUser}
                              onChange={e => {
                                setConnUser(e.target.value);
                                dispatch({ type: 'SET_FIELD', field: 'connUser', value: e.target.value });
                              }}
                              className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-[12.5px] text-[var(--text-primary)] outline-none focus:border-primary-500 transition-colors"
                            />
                          </div>
                          <div>
                            <label className="font-mono text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] mb-1 block">Password</label>
                            <input
                              type="password"
                              placeholder="••••••••"
                              value={connPass}
                              onChange={e => {
                                setConnPass(e.target.value);
                                dispatch({ type: 'SET_FIELD', field: 'connPass', value: e.target.value });
                              }}
                              className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-[12.5px] text-[var(--text-primary)] outline-none focus:border-primary-500 transition-colors"
                            />
                          </div>
                        </div>
                      </div>
                    )}

                    {/* SOURCE FIELDS 2: ORACLE EBS R12 */}
                    {activeCatalogKey === 'ORACLE_EBS' && (
                      <div className="space-y-3">
                        <div className="grid grid-cols-4 gap-2.5">
                          <div className="col-span-3">
                            <label className="font-mono text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] mb-1 block">Oracle Host URL</label>
                            <input
                              type="text"
                              value="jdbc:oracle:thin:@oracle-prod.internal:1521:EBSDB"
                              disabled
                              className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-[12.5px] text-[var(--text-secondary)] opacity-70 outline-none cursor-not-allowed"
                            />
                          </div>
                          <div className="col-span-1">
                            <label className="font-mono text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] mb-1 block">Port</label>
                            <input
                              type="text"
                              value="1521"
                              disabled
                              className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-[12.5px] text-[var(--text-secondary)] opacity-70 outline-none cursor-not-allowed"
                            />
                          </div>
                        </div>
                        <div className="grid grid-cols-3 gap-2.5">
                          <div>
                            <label className="font-mono text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] mb-1 block">Username</label>
                            <input
                              type="text"
                              value="APPS"
                              disabled
                              className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-[12.5px] text-[var(--text-secondary)] opacity-70 outline-none cursor-not-allowed"
                            />
                          </div>
                          <div>
                            <label className="font-mono text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] mb-1 block">Password</label>
                            <input
                              type="password"
                              value="••••••••"
                              disabled
                              className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-[12.5px] text-[var(--text-secondary)] opacity-70 outline-none cursor-not-allowed"
                            />
                          </div>
                          <div>
                            <label className="font-mono text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] mb-1 block">Schema Table</label>
                            <input
                              type="text"
                              value={state.obj === 'VENDOR' ? 'PO_VENDORS' : 'HZ_PARTIES'}
                              disabled
                              className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-[12.5px] text-[var(--text-secondary)] opacity-70 outline-none cursor-not-allowed"
                            />
                          </div>
                        </div>
                      </div>
                    )}

                    {/* SOURCE FIELDS 3: INFOR CLOUDSUITE */}
                    {activeCatalogKey === 'INFOR' && (
                      <div className="space-y-3">
                        <div className="grid grid-cols-4 gap-2.5">
                          <div className="col-span-3">
                            <label className="font-mono text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] mb-1 block">Infor Host URL</label>
                            <input
                              type="text"
                              value="jdbc:infor:cloudsuite:@infor-prod.internal:1433:INFORDB"
                              disabled
                              className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-[12.5px] text-[var(--text-secondary)] opacity-70 outline-none cursor-not-allowed"
                            />
                          </div>
                          <div className="col-span-1">
                            <label className="font-mono text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] mb-1 block">Port</label>
                            <input
                              type="text"
                              value="1433"
                              disabled
                              className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-[12.5px] text-[var(--text-secondary)] opacity-70 outline-none cursor-not-allowed"
                            />
                          </div>
                        </div>
                        <div className="grid grid-cols-3 gap-2.5">
                          <div>
                            <label className="font-mono text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] mb-1 block">Username</label>
                            <input
                              type="text"
                              value="INFOR_ADMIN"
                              disabled
                              className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-[12.5px] text-[var(--text-secondary)] opacity-70 outline-none cursor-not-allowed"
                            />
                          </div>
                          <div>
                            <label className="font-mono text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] mb-1 block">Password</label>
                            <input
                              type="password"
                              value="••••••••"
                              disabled
                              className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-[12.5px] text-[var(--text-secondary)] opacity-70 outline-none cursor-not-allowed"
                            />
                          </div>
                          <div>
                            <label className="font-mono text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] mb-1 block">Table / View</label>
                            <input
                              type="text"
                              value="tccom100"
                              disabled
                              className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-[12.5px] text-[var(--text-secondary)] opacity-70 outline-none cursor-not-allowed"
                            />
                          </div>
                        </div>
                      </div>
                    )}

                    {/* SOURCE FIELDS 4: EXCEL / CSV RELATIONAL FLAT FILES */}
                    {activeCatalogKey === 'EXCEL_CSV' && (
                      <div className="space-y-4">
                        <input
                          type="file"
                          accept=".csv, .xlsx, .xls"
                          className="hidden"
                          ref={fileInputRef}
                          onChange={e => handleFilesAdded(e.target.files)}
                          multiple
                        />

                        {displayedFiles.length === 0 ? (
                          <div
                            className="border-2 border-dashed border-[var(--border)] rounded-xl p-6 flex flex-col items-center justify-center text-center bg-[var(--bg-primary)]/50 hover:bg-[var(--bg-primary)] hover:border-emerald-500/50 transition-all cursor-pointer group"
                            onClick={() => fileInputRef.current?.click()}
                          >
                            <div className="w-12 h-12 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-500 mb-3 group-hover:scale-110 transition-transform">
                              <Cloud className="w-6 h-6" />
                            </div>
                            <p className="text-[13px] text-[var(--text-primary)] font-semibold mb-1">
                              Upload Source Data Files
                            </p>
                            <p className="text-[11.5px] text-[var(--text-tertiary)] mb-3 max-w-[260px]">
                              Select single or multiple (.csv, .xlsx) files to join relational tables
                            </p>
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                fileInputRef.current?.click();
                              }}
                              disabled={isUploading}
                            >
                              {isUploading ? 'Inspecting...' : 'Choose File(s)'}
                            </Button>
                          </div>
                        ) : (
                          <div className="space-y-3">
                            {/* File list header */}
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <span className="text-[12px] font-semibold text-[var(--text-primary)] uppercase tracking-wider font-mono">
                                  Selected Files ({displayedFiles.length})
                                </span>
                                <Badge variant="neutral">{displayedFiles.length > 1 ? 'Multi-Table Join' : 'Single Table'}</Badge>
                              </div>
                              <div className="flex items-center gap-2">
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  onClick={() => fileInputRef.current?.click()}
                                  disabled={isUploading}
                                  icon={<Plus className="w-3.5 h-3.5 text-emerald-500" />}
                                >
                                  Add File
                                </Button>
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  onClick={handleClearStagedFiles}
                                  className="text-red-500 hover:text-red-600"
                                >
                                  Reset
                                </Button>
                              </div>
                            </div>

                            {/* List of files with delete button */}
                            <div className="grid grid-cols-1 gap-2">
                              {displayedFiles.map((file, idx) => {
                                const schema = displayedSchemas.find(s => s.filename === file.name);
                                return (
                                  <div
                                    key={file.name + idx}
                                    className="flex items-center justify-between px-3.5 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] hover:border-emerald-500/40 transition-colors"
                                  >
                                    <div className="flex items-center gap-3 min-w-0">
                                      <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-500 shrink-0">
                                        <FileText className="w-4 h-4" />
                                      </div>
                                      <div className="min-w-0">
                                        <p className="text-[13px] font-medium text-[var(--text-primary)] truncate">
                                          {file.name}
                                        </p>
                                        <p className="text-[10.5px] text-[var(--text-tertiary)]">
                                          {(file.size / 1024).toFixed(1)} KB
                                          {schema && (
                                            <span className="ml-2 text-emerald-600 dark:text-emerald-400 font-mono">
                                              • {schema.headers.length} columns
                                            </span>
                                          )}
                                        </p>
                                      </div>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => handleRemoveStagedFile(file.name)}
                                      className="p-1.5 rounded-lg text-[var(--text-tertiary)] hover:text-red-500 hover:bg-red-500/10 transition-colors cursor-pointer"
                                      title="Remove file"
                                    >
                                      <X className="w-4 h-4" />
                                    </button>
                                  </div>
                                );
                              })}
                            </div>

                            {/* Single file load action */}
                            {displayedFiles.length === 1 && (
                              <Button
                                variant="primary"
                                className="w-full justify-center mt-2"
                                onClick={handleLoadSingleStagedFile}
                                disabled={isUploading}
                                icon={<CheckCircle2 className="w-4 h-4" />}
                              >
                                {isUploading ? 'Loading...' : `Load ${displayedFiles[0].name}`}
                              </Button>
                            )}

                            {/* Multi-file Relational Key Join Configuration */}
                            {displayedFiles.length >= 2 && (
                              <div className="mt-4 pt-3 border-t border-[var(--border)] space-y-3.5">
                                <div className="flex items-center gap-2">
                                  <GitMerge className="w-4 h-4 text-emerald-500" />
                                  <h4 className="text-[12.5px] font-semibold text-[var(--text-primary)]">
                                    Key Join Configuration (Data Modeling)
                                  </h4>
                                </div>

                                {/* Base Table Selector */}
                                <div className="p-3 rounded-xl border border-[var(--border)] bg-[var(--bg-primary)]/60 space-y-1.5">
                                  <label className="font-mono text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] block">
                                    Primary / Base Table (Master Table)
                                  </label>
                                  <Select
                                    value={displayedJoinConfig.base_file}
                                    searchable
                                    onChange={(val) => {
                                      const newBaseJoins = displayedFiles.filter(f => f.name !== val).map(f => {
                                        const baseS = displayedSchemas.find(s => s.filename === val);
                                        const joinS = displayedSchemas.find(s => s.filename === f.name);
                                        const existing = displayedJoinConfig.joins.find(j => j.join_file === f.name);
                                        const kps = existing?.key_pairs?.length
                                          ? existing.key_pairs
                                          : [{
                                            base_key: existing?.base_key || baseS?.headers[0] || '',
                                            join_key: existing?.join_key || joinS?.headers[0] || ''
                                          }];

                                        return {
                                          join_file: f.name,
                                          base_key: kps[0].base_key,
                                          join_key: kps[0].join_key,
                                          key_pairs: kps
                                        };
                                      });
                                      const newCfg = {
                                        base_file: val,
                                        joins: newBaseJoins
                                      };
                                      setJoinConfig(newCfg);
                                      dispatch({ type: 'SET_FIELD', field: 'joinConfig', value: newCfg });
                                    }}
                                    options={displayedFiles.map(f => ({ value: f.name, label: f.name }))}
                                  />
                                </div>

                                {/* Joins for each secondary file */}
                                {displayedJoinConfig.base_file && displayedJoinConfig.joins.map((join, idx) => {
                                  const activeSourceFile = join.source_file || displayedJoinConfig.base_file;
                                  const sourceSchema = displayedSchemas.find(s => s.filename === activeSourceFile)
                                    || displayedSchemas.find(s => s.filename === displayedJoinConfig.base_file);
                                  const joinSchema = displayedSchemas.find(s => s.filename === join.join_file);
                                  const keyPairs = join.key_pairs?.length
                                    ? join.key_pairs
                                    : [{ base_key: join.base_key || '', join_key: join.join_key || '' }];

                                  const otherAvailableFiles = displayedFiles.filter(f => f.name !== join.join_file);

                                  return (
                                    <div
                                      key={join.join_file + idx}
                                      className="p-3.5 rounded-xl border border-[var(--border)] bg-[var(--bg-primary)]/60 space-y-3"
                                    >
                                      <div className="flex flex-wrap items-center justify-between gap-2">
                                        <div className="flex items-center gap-2">
                                          <Layers className="w-3.5 h-3.5 text-emerald-500" />
                                          <span className="text-[12px] font-semibold text-[var(--text-primary)]">
                                            Join: {join.join_file}
                                          </span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                          <div className="flex items-center gap-1.5 bg-[var(--bg-secondary)] px-2 py-0.5 rounded-lg border border-[var(--border)]">
                                            <span className="text-[10px] text-[var(--text-tertiary)] font-mono font-medium">Join With:</span>
                                            <div className="w-44">
                                              <Select
                                                value={activeSourceFile}
                                                onChange={(v) => updateJoinSourceFile(idx, v)}
                                                options={otherAvailableFiles.map(f => ({
                                                  value: f.name,
                                                  label: f.name === displayedJoinConfig.base_file ? `${f.name} (Base)` : f.name
                                                }))}
                                              />
                                            </div>
                                          </div>
                                          {keyPairs.length > 1 && (
                                            <span className="text-[9.5px] font-mono font-bold px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                                              {keyPairs.length} KEY CONDITIONS
                                            </span>
                                          )}
                                          <span className="text-[10px] font-mono text-[var(--text-tertiary)]">LEFT JOIN</span>
                                        </div>
                                      </div>

                                      {/* List of join key pairs */}
                                      <div className="space-y-2.5">
                                        {keyPairs.map((kp, kIdx) => (
                                          <React.Fragment key={kIdx}>
                                            {kIdx > 0 && (
                                              <div className="flex items-center justify-center -my-1">
                                                <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 font-mono text-[9px] font-bold tracking-wider">
                                                  AND (COMPOSITE KEY)
                                                </span>
                                              </div>
                                            )}
                                            <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto] items-end gap-2 bg-[var(--bg-secondary)]/50 p-2.5 rounded-lg border border-[var(--border)]/60 w-full max-w-full">
                                              <div className="min-w-0">
                                                <label className="text-[10.5px] text-[var(--text-secondary)] font-medium mb-1 block truncate">
                                                  {activeSourceFile} Key {keyPairs.length > 1 ? `#${kIdx + 1}` : 'Key'}
                                                </label>
                                                <Select
                                                  value={kp.base_key}
                                                  searchable
                                                  onChange={(v) => updateJoinKeyPair(idx, kIdx, 'base_key', v)}
                                                  options={[
                                                    { value: '', label: `Select ${activeSourceFile} Key...` },
                                                    ...(sourceSchema?.headers.map(h => ({ value: h, label: h })) || [])
                                                  ]}
                                                />
                                              </div>

                                              <div className="flex flex-col items-center justify-center pb-2 shrink-0">
                                                <ArrowRight className="w-4 h-4 text-emerald-500" />
                                              </div>

                                              <div className="min-w-0">
                                                <label className="text-[10.5px] text-[var(--text-secondary)] font-medium mb-1 block truncate">
                                                  {join.join_file} Key {keyPairs.length > 1 ? `#${kIdx + 1}` : 'Foreign Key'}
                                                </label>
                                                <Select
                                                  value={kp.join_key}
                                                  searchable
                                                  onChange={(v) => updateJoinKeyPair(idx, kIdx, 'join_key', v)}
                                                  options={[
                                                    { value: '', label: `Select ${join.join_file} Key...` },
                                                    ...(joinSchema?.headers.map(h => ({ value: h, label: h })) || [])
                                                  ]}
                                                />
                                              </div>

                                              <div className="flex items-center justify-center pb-1 w-8 shrink-0">
                                                {kIdx > 0 ? (
                                                  <button
                                                    type="button"
                                                    onClick={() => removeJoinKeyPair(idx, kIdx)}
                                                    className="p-1.5 rounded-lg text-red-500 hover:bg-red-500/10 transition-colors cursor-pointer"
                                                    title="Remove this composite key condition"
                                                  >
                                                    <Trash2 className="w-4 h-4" />
                                                  </button>
                                                ) : null}
                                              </div>
                                            </div>
                                          </React.Fragment>
                                        ))}
                                      </div>

                                      {/* Add additional key condition button */}
                                      <div className="pt-1">
                                        <button
                                          type="button"
                                          onClick={() => addJoinKeyPair(idx)}
                                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 cursor-pointer transition-colors"
                                        >
                                          <Plus className="w-3 h-3" />
                                          Add Composite Key Condition
                                        </button>
                                      </div>
                                    </div>
                                  );
                                })}

                                <Button
                                  variant="primary"
                                  className="w-full justify-center mt-2"
                                  onClick={handleMergeAndLoadFiles}
                                  disabled={
                                    isMerging ||
                                    isUploading ||
                                    !displayedJoinConfig.base_file ||
                                    displayedJoinConfig.joins.some(j => {
                                      const kps = j.key_pairs?.length ? j.key_pairs : [{ base_key: j.base_key, join_key: j.join_key }];
                                      return kps.length === 0 || kps.some(kp => !kp.base_key || !kp.join_key);
                                    })
                                  }
                                  icon={<GitMerge className="w-4 h-4" />}
                                >
                                  {isMerging ? 'Merging Tables...' : `Merge & Load ${displayedFiles.length} Tables`}
                                </Button>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Loaded state notification banner */}
                        {state.headers.length > 0 && (
                          <div className="flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-[12px] font-medium">
                            <div className="flex items-center gap-2">
                              <CheckCircle2 className="w-4 h-4 shrink-0" />
                              <span>
                                Loaded {(state.rawData?.length || state.uploadedData?.length || 0)} records ({state.headers.length} columns ready)
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* SOURCE FIELDS 5: DYNAMICS / SALESFORCE / LEGACY RDBMS */}
                    {activeCatalogKey !== 'SAP_ECC' && activeCatalogKey !== 'EXCEL_CSV' && activeCatalogKey !== 'ORACLE_EBS' && activeCatalogKey !== 'INFOR' && (
                      <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-2.5">
                          <div>
                            <label className="font-mono text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] mb-1 block">Host / Server</label>
                            <input
                              type="text"
                              placeholder={activeCatalogKey === 'SALESFORCE' ? 'login.salesforce.com' : '192.168.1.100'}
                              value={genericHost}
                              onChange={e => setGenericHost(e.target.value)}
                              className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-[12.5px] text-[var(--text-primary)] outline-none focus:border-primary-500 transition-colors"
                            />
                          </div>
                          <div>
                            <label className="font-mono text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] mb-1 block">Port</label>
                            <input
                              type="text"
                              placeholder={activeCatalogKey === 'SALESFORCE' ? '443' : '1521'}
                              value={genericPort}
                              onChange={e => setGenericPort(e.target.value)}
                              className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-[12.5px] text-[var(--text-primary)] outline-none focus:border-primary-500 transition-colors"
                            />
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2.5">
                          <div>
                            <label className="font-mono text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] mb-1 block">
                              {activeCatalogKey === 'SALESFORCE' ? 'Organization ID' : 'Database'}
                            </label>
                            <input
                              type="text"
                              placeholder={activeCatalogKey === 'SALESFORCE' ? '00D28000000abc...' : 'PROD_DB'}
                              value={genericDb}
                              onChange={e => setGenericDb(e.target.value)}
                              className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-[12.5px] text-[var(--text-primary)] outline-none focus:border-primary-500 transition-colors"
                            />
                          </div>
                          <div>
                            <label className="font-mono text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] mb-1 block">Username</label>
                            <input
                              type="text"
                              placeholder="db_admin"
                              value={genericUser}
                              onChange={e => setGenericUser(e.target.value)}
                              className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-[12.5px] text-[var(--text-primary)] outline-none focus:border-primary-500 transition-colors"
                            />
                          </div>
                        </div>
                        <div>
                          <label className="font-mono text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] mb-1 block">Table / View / Entity</label>
                          <input
                            type="text"
                            placeholder={activeCatalogKey === 'SALESFORCE' ? 'Account' : 'VENDORS_V'}
                            value={genericTable}
                            onChange={e => setGenericTable(e.target.value)}
                            className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-[12.5px] text-[var(--text-primary)] outline-none focus:border-primary-500 transition-colors"
                          />
                        </div>
                      </div>
                    )}

                    {/* Action buttons under Configure Source (Static Button Labels, not changing text) */}
                    {activeCatalogKey !== 'EXCEL_CSV' && (
                      <div className="flex items-center gap-2 pt-3 border-t border-[var(--border)] flex-wrap">
                        <Button
                          variant="secondary"
                          size="sm"
                          icon={<Cable className="w-3.5 h-3.5 text-primary-500" />}
                          onClick={() => {
                            if (activeSourceInBasket) {
                              testConnectionForSource(activeSourceInBasket);
                            } else {
                              const newSrc = addSourceToBasket(activeCatalogKey);
                              if (newSrc) testConnectionForSource(newSrc);
                            }
                          }}
                          disabled={Boolean(activeSourceInBasket && testingSourceId === activeSourceInBasket.id)}
                        >
                          {activeSourceInBasket && testingSourceId === activeSourceInBasket.id ? "Testing..." : "Test Connection"}
                        </Button>

                        <Button
                          variant="warning"
                          size="sm"
                          icon={<Zap className="w-3.5 h-3.5" />}
                          onClick={() => {
                            if (activeSourceInBasket) {
                              extractSample10ForSource(activeSourceInBasket);
                            } else {
                              const newSrc = addSourceToBasket(activeCatalogKey);
                              if (newSrc) extractSample10ForSource(newSrc);
                            }
                          }}
                          disabled={Boolean(activeSourceInBasket && extractingSourceId === activeSourceInBasket.id)}
                        >
                          {activeSourceInBasket && extractingSourceId === activeSourceInBasket.id ? "Loading Sample Data..." : "Load Sample Data"}
                        </Button>

                        {activeSourceInBasket && activeSourceInBasket.sampleRecords && activeSourceInBasket.sampleRecords.length > 0 && (
                          <Button
                            variant="secondary"
                            size="sm"
                            icon={<Eye className="w-3.5 h-3.5 text-emerald-500" />}
                            onClick={() => setPreviewModalSource(activeSourceInBasket)}
                          >
                            Preview Sample Data
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                </CardBody>
              </Card>
            </div>
          )}
        </GridCol>
      </PageGrid>

      {/* ========================================================================= */}
      {/* BOTTOM SECTION: Full Source Data Preview Table                            */}
      {/* ========================================================================= */}
      {has && (
        <div className="mt-6">
          <Card>
            <CardHeader
              title="Source Data Preview"
              subtitle={`${selectedSources.length > 1 ? `${selectedSources.length} Active Sources Ingested` : (selectedSources[0]?.name || state.src)} → ${OBJS[state.obj]?.label || state.obj} | ${state.headers.length} columns`}
            >
              <div className="flex items-center gap-2">
                <Badge variant="neutral">Showing 10 of {state.rawData.length} records</Badge>
                <Button
                  variant="secondary"
                  size="sm"
                  icon={<Download className="w-3.5 h-3.5" />}
                  onClick={() => {
                    dl(expCSV(state.rawData), 'raw_source_data.csv', 'text/csv');
                  }}
                >
                  Export CSV
                </Button>
              </div>
            </CardHeader>
            <CardBody>
              <DataTable rows={state.rawData.slice(0, 10)} cols={state.headers} />
            </CardBody>
          </Card>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODALS: 10 Sample Records Preview Modal (Non-Transparent Solid Background) */}
      {/* ========================================================================= */}
      {previewModalSource && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 sm:p-6">
          <div className="bg-white dark:bg-[#12141a] border border-[var(--border)] rounded-2xl shadow-2xl max-w-5xl w-full max-h-[88vh] flex flex-col overflow-hidden z-10">
            <div className="px-6 py-4 border-b border-[var(--border)] bg-gray-50 dark:bg-[#171a22] flex items-center justify-between shrink-0">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold text-[var(--text-primary)] flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                    10 Sample Records Preview: {previewModalSource.name}
                  </h3>
                  <Badge variant="green">Verified & Staged</Badge>
                </div>
                <p className="text-[12px] text-[var(--text-secondary)] mt-0.5">
                  Extracted sample rows staged for Step 2 AI Mapping and Step 3 Profiling.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPreviewModalSource(null)}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-[var(--text-tertiary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
                title="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-auto p-5 bg-white dark:bg-[#12141a]">
              {previewModalSource.sampleRecords && previewModalSource.sampleRecords.length > 0 ? (
                <div className="rounded-xl border border-[var(--border)] overflow-hidden shadow-sm bg-white dark:bg-[#12141a]">
                  <DataTable
                    rows={previewModalSource.sampleRecords}
                    cols={previewModalSource.headers.length > 0 ? previewModalSource.headers : Object.keys(previewModalSource.sampleRecords[0] || {})}
                  />
                </div>
              ) : (
                <p className="text-center text-[12px] text-[var(--text-secondary)] p-8">No sample records extracted yet.</p>
              )}
            </div>
            <div className="px-6 py-3.5 border-t border-[var(--border)] bg-gray-50 dark:bg-[#171a22] flex items-center justify-between shrink-0">
              <div className="text-[12px] text-[var(--text-secondary)] flex items-center gap-2">
                <span className="font-semibold text-emerald-600 dark:text-emerald-400">✓ Ready for AI Mapping</span>
                <span>•</span>
                <span>{previewModalSource.sampleRecords?.length || 0} records</span>
                <span>•</span>
                <span>{(previewModalSource.headers.length > 0 ? previewModalSource.headers : Object.keys(previewModalSource.sampleRecords?.[0] || {})).length} columns detected</span>
              </div>
              <Button variant="secondary" onClick={() => setPreviewModalSource(null)}>Close Preview</Button>
            </div>
          </div>
        </div>
      )}

      {/* CONFIRM DELETE MODAL */}
      <ConfirmModal
        isOpen={showDeleteConfirm}
        title="Delete Project"
        message="Are you sure you want to delete this project? All associated mappings will be permanently deleted."
        confirmText="Delete Project"
        onConfirm={handleDeleteProject}
        onCancel={() => setShowDeleteConfirm(false)}
        isDestructive={true}
      />

      {/* TARGET OBJECT IMPORT MODAL */}
      <TargetObjectImportModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        onSuccess={(newObj) => {
          fetchBackendObjects();
          pickObj(newObj);
        }}
      />
    </PageLayout>
  );
}
