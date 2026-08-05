import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMigration } from '@/store/migration-store';
import { useToast } from '@/components/ui/toast';
import { SAMPLE } from '@/data/sample-data';
import { OBJS } from '@/data/sap-schemas';
import {
  Card, CardHeader, CardBody, Button, InfoBox, Badge, DataTable,
  PageLayout, PageGrid, GridCol, PageHeader, Divider, SidebarItem, Select, ConfirmModal
} from '@/components/shared';
import { Zap, ArrowRight, Link2, Database, LayoutTemplate, FileSpreadsheet, Layers, Cloud, HardDrive, Users, Building2, Package, Cable, Settings2, Download, FolderGit2, Plus, Edit3, Save, Trash2 } from 'lucide-react';

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
  const [projects, setProjects] = useState<any[]>([]);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectDesc, setNewProjectDesc] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editProjectName, setEditProjectName] = useState('');
  const [editProjectDesc, setEditProjectDesc] = useState('');
  
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    fetchProjects();
  }, []);

  const fetchProjects = async () => {
    try {
      const res = await fetch(`/api/sap/projects/list`);
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
      const res = await fetch('/api/sap/projects/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newProjectName, description: newProjectDesc })
      });
      if (res.ok) {
        const proj = await res.json();
        setProjects([proj, ...projects]);
        dispatch({ type: 'SET_FIELD', field: 'projectId', value: proj.id });
        setNewProjectName('');
        setNewProjectDesc('');
        toast('Project created successfully', 'ok');
      } else {
        toast('Failed to create project', 'err');
      }
    } catch (err) {
      toast('Failed to create project', 'err');
    } finally {
      setIsCreating(false);
    }
  };

  const handleUpdateProject = async () => {
    if (!state.projectId || !editProjectName.trim()) return;
    try {
      const res = await fetch(`/api/sap/projects/update/${state.projectId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editProjectName, description: editProjectDesc })
      });
      if (res.ok) {
        const proj = await res.json();
        setProjects(projects.map(p => p.id === proj.id ? proj : p));
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
      const res = await fetch(`/api/sap/projects/delete/${state.projectId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setProjects(projects.filter(p => p.id !== state.projectId));
        dispatch({ type: 'SET_FIELD', field: 'projectId', value: null });
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

  const pickSrc = (k: string) => dispatch({ type: 'SET_FIELD', field: 'src', value: k });
  const pickObj = (k: string) => dispatch({ type: 'SET_FIELD', field: 'obj', value: k });

  const testConn = () => {
    toast('Testing connection…', 'info');
    setTimeout(() => toast('Connection OK — Simulated. In production: JDBC/RFC/REST API.', 'ok'), 1100);
  };

  const autoLoad = (srcOverride?: string, objOverride?: string) => {
    const src = srcOverride || state.src;
    const obj = objOverride || state.obj;
    let data: Record<string, string>[];
    let finalObj = obj;
    let finalSrc = src;

    if (src === 'ORACLE_EBS') { data = SAMPLE.ORACLE_VENDOR; finalObj = 'VENDOR'; finalSrc = 'ORACLE_EBS'; }
    else if (src === 'EXCEL_CSV') { data = SAMPLE.EXCEL_MATERIAL; finalObj = 'MATERIAL'; finalSrc = 'EXCEL_CSV'; }
    else { data = SAMPLE.SAP_ECC_CUSTOMER; finalObj = 'CUSTOMER'; finalSrc = src; }

    dispatch({
      type: 'BATCH_UPDATE',
      updates: {
        src: finalSrc,
        obj: finalObj,
        rawData: data,
        headers: Object.keys(data[0]),
      },
    });
    toast(`Loaded ${data.length} records from ${finalSrc}`, 'ok');
  };

  const updateField = (field: string, value: string) => {
    dispatch({ type: 'SET_FIELD', field: field as keyof typeof state, value });
  };

  const has = state.rawData.length > 0;

  return (
    <PageLayout>
      <PageHeader title="Step 1 — Source & Data Connect" subtitle="Upload legacy ECC extracts or connect to source databases">
        <Button variant="primary" icon={<ArrowRight className="w-3.5 h-3.5" />} onClick={() => navigate('/mapping')} disabled={!state.src || !state.obj || !state.projectId}>
          Next: AI Mapping
        </Button>
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
          
          <Card>
            <CardHeader title="SAP TARGET OBJECT" />
            <CardBody className="p-2 space-y-1">
              {Object.entries(OBJS).map(([k, v]) => (
                <SidebarItem key={k} active={state.obj === k} onClick={() => pickObj(k)} icon={objIcons[v.icon as keyof typeof objIcons]} title={v.label} subtitle={`${v.module} · ${v.tcode} · ${v.dmc}`} layoutIdGroup="target" />
              ))}
            </CardBody>
          </Card>
        </GridCol>

        {/* Middle Column */}
        <GridCol span={9}>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Connection Config */}
            <Card className="opacity-50 pointer-events-none select-none">
              <CardHeader icon={<Cable className="w-4 h-4" />} title="Connection Config (Disabled)" />
              <CardBody className="space-y-3">
                <div>
                  <label className="font-mono text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] mb-1 block">Source System</label>
                  <Select
                    value={state.src}
                    onChange={(val) => pickSrc(val)}
                    options={[['SAP_ECC','SAP ECC 6.0'],['ORACLE_EBS','Oracle EBS R12'],['EXCEL_CSV','Excel/CSV'],['DYNAMICS','MS Dynamics'],['SALESFORCE','Salesforce'],['LEGACY','Legacy DB']].map(([k,l]) => ({value: k, label: l}))}
                  />
                </div>
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
                    <input type="text" placeholder="sapuser" className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-tertiary)] px-3 py-2 text-[12.5px] text-[var(--text-primary)] outline-none focus:border-primary-500 transition-colors" />
                  </div>
                </div>
                <div>
                  <label className="font-mono text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] mb-1 block">Table / View</label>
                  <input type="text" placeholder="KNA1 / CUSTOMER_VIEW" className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-tertiary)] px-3 py-2 text-[12.5px] text-[var(--text-primary)] outline-none focus:border-primary-500 transition-colors" />
                </div>
                <div className="flex gap-2">
                  <Button variant="secondary" icon={<Cable className="w-3.5 h-3.5" />} className="flex-1" onClick={testConn}>Test Connection</Button>
                  <Button variant="warning" icon={<Zap className="w-3.5 h-3.5" />} className="flex-1" onClick={() => autoLoad()}>Load Sample Data</Button>
                </div>
              </CardBody>
            </Card>

            {/* Project Workspace */}
            <Card>
              <CardHeader icon={<FolderGit2 className="w-4 h-4" />} title="Project Workspace" subtitle="Required for mapping" />
              <CardBody className="space-y-4">
                <div>
                  <label className="font-mono text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] mb-1.5 block">Select Existing Project</label>
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <Select
                        value={state.projectId || ''}
                        onChange={(val) => {
                          dispatch({ type: 'SET_FIELD', field: 'projectId', value: val });
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
                <Badge variant="neutral">{state.rawData.length} records</Badge>
                <Button variant="secondary" size="sm" icon={<Download className="w-3.5 h-3.5" />} onClick={() => {
                  import('@/lib/utils').then(({ expCSV, dl }) => {
                    dl(expCSV(state.rawData), 'raw_source_data.csv', 'text/csv');
                  });
                }}>Export</Button>
              </CardHeader>
              <CardBody>
                <DataTable rows={state.rawData} cols={state.headers} />
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
