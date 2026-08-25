import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMigration } from '@/store/migration-store';
import { useToast } from '@/components/ui/toast';
import { useLoading } from '@/components/ui/loading-overlay';
import { SAMPLE } from '@/data/sample-data';
import { OBJS } from '@/data/sap-schemas';
import {
  Card, CardHeader, CardBody, Button, InfoBox, Badge, DataTable,
  PageLayout, PageGrid, GridCol, PageHeader, Divider, SidebarItem, Select, ConfirmModal
} from '@/components/shared';
import { Zap, ArrowRight, Link2, Database, LayoutTemplate, FileSpreadsheet, Layers, Cloud, HardDrive, Users, Building2, Package, Cable, Settings2, Download, FolderGit2, Plus, Edit3, Save, Trash2, X, GitMerge, FileText, CheckCircle2 } from 'lucide-react';
import { saveStagedFilesToDB, loadStagedFilesFromDB, removeStagedFileFromDB, clearAllStagedFilesFromDB } from '@/lib/file-storage';

const objIcons = {
  users: <Users className="w-4 h-4 text-blue-500" />,
  building: <Building2 className="w-4 h-4 text-violet-500" />,
  package: <Package className="w-4 h-4 text-emerald-500" />
};

const SOURCES = [
  { key: 'SAP_ECC', icon: <Database className="w-4 h-4 text-blue-500" />, name: 'SAP ECC 6.0', sub: 'Classic SAP — KNA1/LFA1' },
  { key: 'ORACLE_EBS', icon: <Layers className="w-4 h-4 text-red-500" />, name: 'Oracle EBS R12', sub: 'AR/AP tables' },
  { key: 'EXCEL_CSV', icon: <FileSpreadsheet className="w-4 h-4 text-emerald-500" />, name: 'Excel / CSV', sub: 'Flat file upload' },
  { key: 'DYNAMICS', icon: <LayoutTemplate className="w-4 h-4 text-blue-600" />, name: 'MS Dynamics 365', sub: 'CRM/ERP export' },
  { key: 'SALESFORCE', icon: <Cloud className="w-4 h-4 text-sky-500" />, name: 'Salesforce CRM', sub: 'Account data' },
  { key: 'LEGACY', icon: <HardDrive className="w-4 h-4 text-slate-500" />, name: 'Legacy / Custom DB', sub: 'Any RDBMS' },
];

const DATASETS = [
  { title: 'SAP ECC Customers', desc: '10 records with intentional errors — missing IDs, wrong country/currency format, empty required fields', srcKey: 'SAP_ECC', objKey: 'CUSTOMER' },
  { title: 'Oracle ERP Vendors', desc: '7 vendor records — mixed country formats, duplicate entry, payment term variations', srcKey: 'ORACLE_EBS', objKey: 'VENDOR' },
  { title: 'Excel Materials', desc: '8 material records — mixed material type formats, empty rows, various industry sectors', srcKey: 'EXCEL_CSV', objKey: 'MATERIAL' },
];

export function Step1SourceData() {
  const { state, dispatch } = useMigration();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { showLoad, hideLoad, tick } = useLoading();
  const [projects, setProjects] = useState<any[]>([]);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectDesc, setNewProjectDesc] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editProjectName, setEditProjectName] = useState('');
  const [editProjectDesc, setEditProjectDesc] = useState('');

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Connection State
  const updateField = (field: any, value: any) => dispatch({ type: 'SET_FIELD', field, value });
  const [isTestingConn, setIsTestingConn] = useState(false);
  const [isFetchingSample, setIsFetchingSample] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
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

  const updateJoinSourceFile = (joinIdx: number, newSourceFile: string) => {
    setJoinConfig((prev) => {
      const curCfg = prev.base_file ? prev : (state.joinConfig || { base_file: '', joins: [] });
      const srcSchema = displayedSchemas.find(s => s.filename === newSourceFile);
      const newJoins = (curCfg.joins || []).map((j, i) => {
        if (i !== joinIdx) return j;
        const joinSchema = displayedSchemas.find(s => s.filename === j.join_file);

        // Auto-match keys between newSourceFile and j.join_file
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
  const [isMerging, setIsMerging] = useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchProjects();
    loadStagedFilesFromDB().then((persistedFiles) => {
      if (persistedFiles && persistedFiles.length > 0) {
        setStagedFiles(persistedFiles);
        if (fileSchemas.length === 0) {
          fetchFileSchemas(persistedFiles);
        }
      }
    });
  }, []);

  const fetchProjects = async () => {
    try {
      const res = await fetch(`${import.meta.env.VITE_BACKEND_URL}/api/sap/projects/list`);
      if (res.ok) {
        const data = await res.json();
        setProjects(data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleCreateProject = async () => {
    if (!newProjectName.trim()) return;
    setIsCreating(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_BACKEND_URL}/api/sap/projects/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newProjectName, description: newProjectDesc })
      });
      if (res.ok) {
        const proj = await res.json();
        setProjects([proj, ...projects]);
        dispatch({ type: 'BATCH_UPDATE', updates: { projectId: proj.id, projectName: proj.name } });
        setNewProjectName('');
        setNewProjectDesc('');
        toast('Project created successfully', 'ok');
      } else {
        toast('Failed to create project', 'err');
      }
    } catch (err: any) {
      toast(err.message, 'err');
    } finally {
      setIsFetchingSample(false);
    }
  };

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
      const res = await fetch(`${import.meta.env.VITE_BACKEND_URL}/api/sap/extract/upload-preview`, {
        method: 'POST',
        body: formData
      });
      if (!res.ok) throw new Error('Failed to preview file schemas');
      const data = await res.json();
      const schemas: { filename: string; headers: string[] }[] = data.files || [];
      setFileSchemas(schemas);

      // Setup default join config
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

    // Filter out files that already exist by name
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
      const res = await fetch(`${import.meta.env.VITE_BACKEND_URL}/api/sap/extract/upload-preview`, {
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

      // Keep existing joins intact
      const existingJoins = curCfg.joins || [];
      const existingJoinFiles = new Set(existingJoins.map(j => j.join_file));

      // Append default joins for newly added files (excluding the base file)
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

    // Recompute joinConfig for remaining files
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
    showLoad('Uploading File...', `Parsing ${file.name}`, ['Reading columns...']);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch(`${import.meta.env.VITE_BACKEND_URL}/api/sap/extract/upload`, {
        method: 'POST',
        body: formData
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || 'Failed to upload file');
      }

      const data = await res.json();
      dispatch({
        type: 'BATCH_UPDATE',
        updates: {
          headers: data.headers,
          uploadedData: data.data,
          rawData: data.data,
          uploadedFilesMeta: displayedFiles.map(f => ({ name: f.name, size: f.size })),
          fileSchemas: fileSchemas,
          joinConfig: joinConfig
        }
      });
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
    showLoad('Merging Datasets...', `Joining ${displayedFiles.length} files on selected keys`, ['Aligning relational records...']);

    const formData = new FormData();
    stagedFiles.forEach(f => formData.append('files', f));
    formData.append('join_config', JSON.stringify(joinConfig));

    try {
      const res = await fetch(`${import.meta.env.VITE_BACKEND_URL}/api/sap/extract/upload-merge`, {
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
      dispatch({
        type: 'BATCH_UPDATE',
        updates: {
          headers: data.headers,
          uploadedData: data.data,
          rawData: data.data
        }
      });
      toast(`Successfully joined ${displayedFiles.length} files! Loaded ${data.headers.length} columns and ${data.data.length} rows.`, 'ok');
    } catch (err: any) {
      toast(err?.message || 'Merge failed', 'err');
    } finally {
      setIsMerging(false);
      hideLoad();
    }
  };

  const handleLoadOracle = async () => {
    setIsUploading(true);
    showLoad('Loading Oracle Extract...', 'Parsing Oracle sample data', ['Reading columns...', 'Extracting 10 sample rows...']);
    try {
      const response = await fetch('/Oracle.xlsx');
      if (!response.ok) throw new Error('Failed to fetch Oracle.xlsx from public folder');

      const blob = await response.blob();
      const file = new File([blob], 'Oracle.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch(`${import.meta.env.VITE_BACKEND_URL}/api/sap/extract/upload`, {
        method: 'POST',
        body: formData
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || 'Failed to upload file');
      }

      const data = await res.json();
      const sampleData = (data.data || []).slice(0, 10);
      dispatch({
        type: 'BATCH_UPDATE',
        updates: {
          headers: data.headers || [],
          rawData: sampleData,
          uploadedData: data.data || []
        }
      });
      toast(`Successfully loaded ${data.headers?.length || 0} columns and ${sampleData.length} sample rows from Oracle EBS!`, 'ok');
    } catch (err: any) {
      toast(err.message, 'err');
    } finally {
      setIsUploading(false);
      hideLoad();
    }
  };

  const handleUpdateProject = async () => {
    if (!state.projectId || !editProjectName.trim()) return;
    try {
      const res = await fetch(`${import.meta.env.VITE_BACKEND_URL}/api/sap/projects/update/${state.projectId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editProjectName, description: editProjectDesc })
      });
      if (res.ok) {
        const proj = await res.json();
        setProjects(projects.map(p => p.id === proj.id ? proj : p));
        dispatch({ type: 'BATCH_UPDATE', updates: { projectName: proj.name } });
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

  const startEditing = () => {
    const p = projects.find(p => p.id === state.projectId);
    if (p) {
      setEditProjectName(p.name);
      setEditProjectDesc(p.description || '');
      setIsEditing(true);
    }
  };

  const confirmDeleteProject = () => {
    if (!state.projectId) return;
    setShowDeleteConfirm(true);
  };

  const handleDeleteProject = async () => {
    if (!state.projectId) return;
    try {
      const res = await fetch(`${import.meta.env.VITE_BACKEND_URL}/api/sap/projects/delete/${state.projectId}`, {
        method: 'DELETE',
      });
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

  const pickSrc = async (k: string) => {
    if (k !== state.src) {
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
          src: k,
          uploadedFilesMeta: [],
          fileSchemas: [],
          joinConfig: { base_file: '', joins: [] },
          headers: [],
          rawData: [],
          uploadedData: []
        }
      });
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };
  const pickObj = (k: string) => dispatch({ type: 'SET_FIELD', field: 'obj', value: k });

  const testConn = async () => {
    if (!state.connUrl || !state.connUser || !state.connPass) {
      toast('Please fill in Base URL, Username, and Password', 'err');
      return;
    }

    setIsTestingConn(true);
    toast('Testing connection to SAP...', 'info');

    try {
      const res = await fetch(`${import.meta.env.VITE_BACKEND_URL}/api/sap/connection/test_connection`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          base_url: state.connUrl,
          client: state.connClient,
          username: state.connUser,
          password: state.connPass,
          system_type: state.src
        })
      });
      const data = await res.json();
      if (res.ok) {
        toast('Connection successful!', 'ok');
      } else {
        toast(`Connection failed: ${data.detail || 'Unknown error'}`, 'err');
      }
    } catch (err) {
      toast('Failed to reach backend', 'err');
    } finally {
      setIsTestingConn(false);
    }
  };

  const autoLoad = async () => {
    let data: Record<string, string>[] = [];

    if (state.src === 'SAP_ECC') {
      if (!state.connUrl || !state.connUser || !state.connPass) {
        toast('Please fill in Base URL, Username, and Password to fetch live data', 'err');
        return;
      }
      setIsFetchingSample(true);
      toast(`Fetching live ${state.obj || 'CUSTOMER'} data from SAP...`, 'info');

      try {
        const res = await fetch(`${import.meta.env.VITE_BACKEND_URL}/api/sap/extract/fetch_sample`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            base_url: state.connUrl,
            client: state.connClient,
            username: state.connUser,
            password: state.connPass,
            system_type: state.src,
            target_object: state.obj || 'CUSTOMER'
          })
        });
        const resData = await res.json();
        if (res.ok) {
          data = resData.data;
          if (data.length === 0) {
            toast('No records found in SAP for this object.', 'info');
            setIsFetchingSample(false);
            return;
          }
        } else {
          toast(`Fetch failed: ${resData.detail || 'Unknown error'}`, 'err');
          setIsFetchingSample(false);
          return;
        }
      } catch (err) {
        toast('Failed to reach backend to fetch data', 'err');
        setIsFetchingSample(false);
        return;
      } finally {
        setIsFetchingSample(false);
      }
    } else {
      // Choose data purely based on the selected SAP target object
      if (state.obj === 'VENDOR') {
        data = SAMPLE.ORACLE_VENDOR;
      } else if (state.obj === 'MATERIAL') {
        data = SAMPLE.EXCEL_MATERIAL;
      } else {
        // Default to CUSTOMER
        data = SAMPLE.SAP_ECC_CUSTOMER;
      }
    }

    dispatch({
      type: 'BATCH_UPDATE',
      updates: {
        rawData: data,
        headers: Object.keys(data[0] || {}),
      },
    });

    if (state.src === 'SAP_ECC') {
      toast(`Successfully loaded ${data.length} live records from SAP!`, 'ok');
    } else {
      toast(`Loaded ${data.length} sample records for ${state.obj || 'CUSTOMER'}`, 'ok');
    }
  };

  const has = state.rawData.length > 0 || state.uploadedData.length > 0;
  const displayedFiles = stagedFiles.length > 0
    ? stagedFiles.map(f => ({ name: f.name, size: f.size }))
    : (state.uploadedFilesMeta || []);
  const displayedSchemas = fileSchemas.length > 0 ? fileSchemas : (state.fileSchemas || []);
  const displayedJoinConfig = joinConfig.base_file ? joinConfig : (state.joinConfig || { base_file: '', joins: [] });

  const nextDisabled = !state.src || !state.obj || !state.projectId || (state.src === 'SAP_ECC' && (!state.connUrl || !state.connUser || !state.connPass || (state.rawData.length === 0 && state.uploadedData.length === 0)));

  return (
    <PageLayout>
      <PageHeader title="Step 1 — Source & Data Connect" subtitle="Upload legacy ECC extracts or connect to source databases">
        <div title={nextDisabled ? "Complete all connection fields, select a project, and load sample data to proceed." : ""}>
          <Button variant="primary" icon={<ArrowRight className="w-3.5 h-3.5" />} onClick={() => navigate('/mapping')} disabled={nextDisabled}>
            Next: AI Mapping
          </Button>
        </div>
      </PageHeader>

      <PageGrid>
        {/* Left Column */}
        <GridCol span={3}>
          <Card>
            <CardHeader title="SOURCE SYSTEM" subtitle="Select data origin" />
            <CardBody className="p-2 space-y-1">
              {SOURCES.map((s) => (
                <SidebarItem key={s.key} active={state.src === s.key} onClick={() => pickSrc(s.key)} icon={s.icon} title={s.name} subtitle={s.sub} layoutIdGroup="source" />
              ))}
            </CardBody>
          </Card>
        </GridCol>

        {/* Middle Column */}
        <GridCol span={9}>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Connection Config */}
            <Card>
              <CardHeader icon={<Cable className="w-4 h-4" />} title="Connection Config" />
              <CardBody className="space-y-3">
                <div>
                  <label className="font-mono text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] mb-1 block">Source System</label>
                  <Select
                    value={state.src}
                    onChange={(val) => pickSrc(val)}
                    options={[['SAP_ECC', 'SAP ECC 6.0'], ['ORACLE_EBS', 'Oracle EBS R12'], ['EXCEL_CSV', 'Excel/CSV'], ['DYNAMICS', 'MS Dynamics'], ['SALESFORCE', 'Salesforce'], ['LEGACY', 'Legacy DB']].map(([k, l]) => ({ value: k, label: l }))}
                  />
                </div>

                {state.src === 'SAP_ECC' && (
                  <>
                    <div className="grid grid-cols-4 gap-2.5">
                      <div className="col-span-3">
                        <label className="font-mono text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] mb-1 block">Base URL</label>
                        <input type="text" placeholder="https://host:port" value={state.connUrl} onChange={e => updateField('connUrl', e.target.value)} className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-tertiary)] px-3 py-2 text-[12.5px] text-[var(--text-primary)] outline-none focus:border-primary-500 transition-colors" />
                      </div>
                      <div className="col-span-1">
                        <label className="font-mono text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] mb-1 block">Client</label>
                        <input type="text" placeholder="100" value={state.connClient} onChange={e => updateField('connClient', e.target.value)} className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-tertiary)] px-3 py-2 text-[12.5px] text-[var(--text-primary)] outline-none focus:border-primary-500 transition-colors" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2.5">
                      <div>
                        <label className="font-mono text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] mb-1 block">Username</label>
                        <input type="text" placeholder="sapuser" value={state.connUser} onChange={e => updateField('connUser', e.target.value)} className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-tertiary)] px-3 py-2 text-[12.5px] text-[var(--text-primary)] outline-none focus:border-primary-500 transition-colors" />
                      </div>
                      <div>
                        <label className="font-mono text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] mb-1 block">Password</label>
                        <input type="password" placeholder="••••••••" value={state.connPass} onChange={e => updateField('connPass', e.target.value)} className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-tertiary)] px-3 py-2 text-[12.5px] text-[var(--text-primary)] outline-none focus:border-primary-500 transition-colors" />
                      </div>
                    </div>
                  </>
                )}

                {(state.src === 'ORACLE_EBS') && (
                  <>
                    <div className="grid grid-cols-4 gap-2.5">
                      <div className="col-span-3">
                        <label className="font-mono text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] mb-1 block">Oracle Host URL</label>
                        <input type="text" value="jdbc:oracle:thin:@oracle-prod.internal:1521:EBSDB" disabled className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-tertiary)] px-3 py-2 text-[12.5px] text-[var(--text-tertiary)] outline-none cursor-not-allowed opacity-70" />
                      </div>
                      <div className="col-span-1">
                        <label className="font-mono text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] mb-1 block">Port</label>
                        <input type="text" value="1521" disabled className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-tertiary)] px-3 py-2 text-[12.5px] text-[var(--text-tertiary)] outline-none cursor-not-allowed opacity-70" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2.5">
                      <div>
                        <label className="font-mono text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] mb-1 block">Username</label>
                        <input type="text" value="APPS" disabled className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-tertiary)] px-3 py-2 text-[12.5px] text-[var(--text-tertiary)] outline-none cursor-not-allowed opacity-70" />
                      </div>
                      <div>
                        <label className="font-mono text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] mb-1 block">Password</label>
                        <input type="password" value="••••••••" disabled className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-tertiary)] px-3 py-2 text-[12.5px] text-[var(--text-tertiary)] outline-none cursor-not-allowed opacity-70" />
                      </div>
                    </div>
                  </>
                )}

                {(state.src === 'EXCEL_CSV') && (
                  <div className="space-y-4">
                    {/* Hidden Multi-file input */}
                    <input
                      type="file"
                      accept=".csv, .xlsx, .xls"
                      className="hidden"
                      ref={fileInputRef}
                      onChange={e => handleFilesAdded(e.target.files)}
                      multiple
                    />

                    {/* Staged files list / Upload area */}
                    {displayedFiles.length === 0 ? (
                      <div
                        className="border-2 border-dashed border-[var(--border)] rounded-xl p-6 flex flex-col items-center justify-center text-center bg-[var(--bg-tertiary)]/50 hover:bg-[var(--bg-tertiary)] hover:border-emerald-500/50 transition-all cursor-pointer group"
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

                        {/* List of files with delete (X) mark */}
                        <div className="grid grid-cols-1 gap-2">
                          {displayedFiles.map((file, idx) => {
                            const schema = displayedSchemas.find(s => s.filename === file.name);
                            return (
                              <div
                                key={file.name + idx}
                                className="flex items-center justify-between px-3.5 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--bg-tertiary)]/70 hover:border-emerald-500/40 transition-colors"
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
                                  className="p-1.5 rounded-lg text-[var(--text-tertiary)] hover:text-red-500 hover:bg-red-500/10 transition-colors"
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
                            <div className="p-3 rounded-xl border border-[var(--border)] bg-[var(--bg-tertiary)]/40 space-y-1.5">
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
                                  className="p-3.5 rounded-xl border border-[var(--border)] bg-[var(--bg-tertiary)]/40 space-y-3"
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

                {state.src !== 'SAP_ECC' && state.src !== 'EXCEL_CSV' && state.src !== 'ORACLE_EBS' && (
                  <>
                    <div className="grid grid-cols-2 gap-2.5">
                      <div>
                        <label className="font-mono text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] mb-1 block">Host/Server</label>
                        <input type="text" placeholder="192.168.1.100" className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-tertiary)] px-3 py-2 text-[12.5px] text-[var(--text-primary)] outline-none focus:border-primary-500 transition-colors" />
                      </div>
                      <div>
                        <label className="font-mono text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] mb-1 block">Port</label>
                        <input type="text" placeholder="1521" className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-tertiary)] px-3 py-2 text-[12.5px] text-[var(--text-primary)] outline-none focus:border-primary-500 transition-colors" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2.5">
                      <div>
                        <label className="font-mono text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] mb-1 block">Database</label>
                        <input type="text" placeholder="ORCL" className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-tertiary)] px-3 py-2 text-[12.5px] text-[var(--text-primary)] outline-none focus:border-primary-500 transition-colors" />
                      </div>
                      <div>
                        <label className="font-mono text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] mb-1 block">Username</label>
                        <input type="text" placeholder="dbuser" className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-tertiary)] px-3 py-2 text-[12.5px] text-[var(--text-primary)] outline-none focus:border-primary-500 transition-colors" />
                      </div>
                    </div>
                    <div>
                      <label className="font-mono text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] mb-1 block">Table / View</label>
                      <input type="text" placeholder="VENDORS_V" className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-tertiary)] px-3 py-2 text-[12.5px] text-[var(--text-primary)] outline-none focus:border-primary-500 transition-colors" />
                    </div>
                  </>
                )}

                {(state.src === 'SAP_ECC' || state.src === 'ORACLE_EBS') && (
                  <div className="flex gap-2 pt-1">
                    <Button
                      variant="secondary"
                      icon={<Cable className="w-3.5 h-3.5" />}
                      className="flex-1 justify-center"
                      disabled={isTestingConn || isFetchingSample || isUploading}
                      onClick={() => {
                        if (state.src === 'SAP_ECC') {
                          testConn();
                        } else {
                          toast('Connection to Oracle EBS successful!', 'ok');
                        }
                      }}
                    >
                      {isTestingConn ? 'Testing...' : 'Test Connection'}
                    </Button>
                    <Button
                      variant="warning"
                      icon={<Zap className="w-3.5 h-3.5" />}
                      className="flex-1"
                      disabled={isFetchingSample || isTestingConn || isUploading}
                      onClick={() => {
                        if (state.src === 'SAP_ECC') {
                          autoLoad();
                        } else {
                          handleLoadOracle();
                        }
                      }}
                    >
                      {isFetchingSample || isUploading ? 'Loading Data...' : 'Load Sample Data'}
                    </Button>
                  </div>
                )}
              </CardBody>
            </Card>

            {/* Project Workspace */}
            <Card>
              <CardHeader icon={<FolderGit2 className="w-4 h-4" />} title="Project Workspace" subtitle="Required for mapping" />
              <CardBody className="space-y-4">
                <div>
                  <label className="font-mono text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] mb-1.5 block">Target Object</label>
                  <Select
                    value={state.obj || ''}
                    onChange={(val) => pickObj(val)}
                    options={[
                      { value: '', label: '— Select a target object —' },
                      ...Object.entries(OBJS).map(([k, v]) => ({ value: k, label: `${v.label} (${v.module})` }))
                    ]}
                  />
                </div>
                <div>
                  <label className="font-mono text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] mb-1.5 block">Select Existing Project</label>
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <Select
                        value={state.projectId || ''}
                        onChange={(val) => {
                          const p = projects.find(proj => proj.id === val);
                          dispatch({ type: 'BATCH_UPDATE', updates: { projectId: val, projectName: p ? p.name : null } });
                          setIsEditing(false);
                        }}
                        options={
                          projects.length === 0
                            ? [{ value: '', label: 'No projects found (Create one below)' }]
                            : [
                              { value: '', label: '— Select a project —' },
                              ...projects.map(p => ({ value: p.id, label: p.name }))
                            ]
                        }
                      />
                    </div>
                    {state.projectId && !isEditing && (
                      <div className="flex gap-1.5">
                        <Button variant="secondary" icon={<Edit3 className="w-3.5 h-3.5" />} onClick={startEditing}>
                          Edit
                        </Button>
                        <Button variant="danger" icon={<Trash2 className="w-3.5 h-3.5" />} onClick={confirmDeleteProject}>
                          Delete
                        </Button>
                      </div>
                    )}
                  </div>
                </div>

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
                      placeholder="Project Name (e.g. Acme Corp Migration)"
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

                {!state.projectId && (
                  <InfoBox variant="warning" className="mt-2">
                    <strong>Action Required:</strong> You must select or create a project before you can proceed to AI Mapping.
                  </InfoBox>
                )}
              </CardBody>
            </Card>
          </div>

          {has && (
            <Card>
              <CardHeader title="Source Data Preview" subtitle={`${state.src} → ${OBJS[state.obj]?.label} | ${state.headers.length} columns`}>
                <Badge variant="neutral">Showing 10 of {state.rawData.length} records</Badge>
                <Button variant="secondary" size="sm" icon={<Download className="w-3.5 h-3.5" />} onClick={() => {
                  import('@/lib/utils').then(({ expCSV, dl }) => {
                    dl(expCSV(state.rawData), 'raw_source_data.csv', 'text/csv');
                  });
                }}>Export</Button>
              </CardHeader>
              <CardBody>
                <DataTable rows={state.rawData.slice(0, 10)} cols={state.headers} />
              </CardBody>
            </Card>
          )}
        </GridCol>
      </PageGrid>
      <ConfirmModal
        isOpen={showDeleteConfirm}
        title="Delete Project"
        message="Are you sure you want to delete this project? All associated mappings will be permanently deleted."
        confirmText="Delete Project"
        onConfirm={handleDeleteProject}
        onCancel={() => setShowDeleteConfirm(false)}
        isDestructive={true}
      />
    </PageLayout>
  );
}
