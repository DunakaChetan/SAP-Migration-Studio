import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useMigration } from '@/store/migration-store';
import { useToast } from '@/components/ui/toast';
import { SAMPLE } from '@/data/sample-data';
import { OBJS } from '@/data/sap-schemas';
import {
  Card, CardHeader, CardBody, Button, InfoBox, Badge, DataTable,
  PageLayout, PageGrid, GridCol, PageHeader, Divider, SidebarItem, Select
} from '@/components/shared';
import { Zap, ArrowRight, Link2, Database, LayoutTemplate, FileSpreadsheet, Layers, Cloud, HardDrive, Users, Building2, Package, Cable, Settings2, Download } from 'lucide-react';

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
        <Button variant="primary" icon={<ArrowRight className="w-3.5 h-3.5" />} onClick={() => navigate('/mapping')} disabled={!has}>
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
        <GridCol span={6}>
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

            {/* SAP Org Defaults */}
            <Card>
              <CardHeader icon={<Settings2 className="w-4 h-4" />} title="SAP Org Defaults" />
              <CardBody className="space-y-3">
                <div className="grid grid-cols-3 gap-2.5">
                  {[['Company Code','cc','1000'],['Sales Org','so','1000'],['Purch Org','po','1000']].map(([l,k,d]) => (
                    <div key={k}>
                      <label className="font-mono text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] mb-1 block">{l}</label>
                      <input type="text" value={(state as unknown as Record<string, unknown>)[k] as string || d} onChange={(e) => updateField(k, e.target.value)} className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-tertiary)] px-3 py-2 text-[12.5px] text-[var(--text-primary)] outline-none focus:border-primary-500 transition-colors" />
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-3 gap-2.5">
                  {[['Plant','plant','1000'],['Dist.Ch','distch','10'],['Currency','curr','INR']].map(([l,k,d]) => (
                    <div key={k}>
                      <label className="font-mono text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] mb-1 block">{l}</label>
                      <input type="text" value={(state as unknown as Record<string, unknown>)[k] as string || d} onChange={(e) => updateField(k, e.target.value)} className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-tertiary)] px-3 py-2 text-[12.5px] text-[var(--text-primary)] outline-none focus:border-primary-500 transition-colors" />
                    </div>
                  ))}
                </div>
                <Divider />
                <InfoBox variant="warning">
                  <strong>Quick Start:</strong> Click <strong>Auto-Load Sample Data</strong> to instantly load{' '}
                  {state.src === 'ORACLE_EBS' ? '7 Oracle ERP vendor' : state.src === 'EXCEL_CSV' ? '8 material master' : '10 customer master'}{' '}
                  records and proceed to AI mapping.
                </InfoBox>
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

        {/* Right Column */}
        <GridCol span={3}>
          <Card>
            <CardHeader title="PRE-LOADED DATASETS" />
            <CardBody className="space-y-2 p-3">
              {DATASETS.map((d) => (
                <button
                  key={d.srcKey}
                  onClick={() => { pickSrc(d.srcKey); pickObj(d.objKey); autoLoad(d.srcKey, d.objKey); }}
                  className="w-full text-left p-3 rounded-xl border border-[var(--border)] bg-[var(--bg-tertiary)]/50 hover:border-primary-300 dark:hover:border-primary-700 transition-all cursor-pointer group"
                >
                  <div className="text-[11.5px] font-bold text-[var(--text-primary)] mb-1">{d.title}</div>
                  <div className="text-[10px] text-[var(--text-tertiary)] mb-2 leading-relaxed">{d.desc}</div>
                  <Badge variant="blue" className="group-hover:bg-primary-100 dark:group-hover:bg-primary-900/40">Load Now →</Badge>
                </button>
              ))}
            </CardBody>
          </Card>
          
          <Card>
            <CardHeader title="ALL DATASETS CONTAIN" />
            <CardBody className="p-3">
              <InfoBox variant="info">
                <strong className="text-primary-600 dark:text-primary-400">All datasets contain:</strong><br />
                • Intentional data quality issues<br />
                • Missing required fields<br />
                • Wrong format values<br />
                • Duplicate records<br />
                • Mixed country/currency names<br />
                to demonstrate the full AI cleansing pipeline
              </InfoBox>
            </CardBody>
          </Card>
        </GridCol>
      </PageGrid>
    </PageLayout>
  );
}
