-- ==========================================
-- Drop existing tables to allow clean re-runs
-- ==========================================
DROP TABLE IF EXISTS tech_docs CASCADE;
DROP TABLE IF EXISTS dynamic_rules CASCADE;
DROP TABLE IF EXISTS transformed_data CASCADE;
DROP TABLE IF EXISTS cleansed_data CASCADE;
DROP TABLE IF EXISTS validation_report CASCADE;
DROP TABLE IF EXISTS harmonized_data CASCADE;
DROP TABLE IF EXISTS extracted_data CASCADE;
DROP TABLE IF EXISTS user_corrected_mappings CASCADE;
DROP TABLE IF EXISTS ai_mapping_cache CASCADE;
DROP TABLE IF EXISTS source_fields CASCADE;
DROP TABLE IF EXISTS source_systems CASCADE;
DROP TABLE IF EXISTS sap_fields CASCADE;
DROP TABLE IF EXISTS sap_objects CASCADE;
DROP TABLE IF EXISTS projects CASCADE;

-- Create extension for UUID if it doesn't exist
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ==========================================
-- Foundational Master Tables
-- ==========================================

-- Table: projects
CREATE TABLE projects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Table: sap_objects
CREATE TABLE sap_objects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Table: sap_fields
CREATE TABLE sap_fields (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    object_id UUID NOT NULL REFERENCES sap_objects(id) ON DELETE CASCADE,
    sheet_name TEXT,
    group_name TEXT,
    field_description TEXT,
    type TEXT,
    length TEXT,
    decimals TEXT,
    sap_structure TEXT,
    field_name TEXT NOT NULL,
    is_mandatory BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE (object_id, sap_structure, field_name)
);

-- Table: source_systems
CREATE TABLE source_systems (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Table: source_fields
CREATE TABLE source_fields (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    source_system_id UUID NOT NULL REFERENCES source_systems(id) ON DELETE CASCADE,
    object_id UUID NOT NULL REFERENCES sap_objects(id) ON DELETE CASCADE,
    sap_field_id UUID REFERENCES sap_fields(id) ON DELETE SET NULL,
    oracle_ebs_table TEXT,
    oracle_ebs_field_name TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE (source_system_id, object_id, oracle_ebs_table, oracle_ebs_field_name)
);

-- Table: ai_mapping_cache
CREATE TABLE ai_mapping_cache (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    source_system_id UUID NOT NULL REFERENCES source_systems(id) ON DELETE CASCADE,
    source_field_id UUID NOT NULL REFERENCES source_fields(id) ON DELETE CASCADE,
    sap_field_id UUID NOT NULL REFERENCES sap_fields(id) ON DELETE CASCADE,
    transform_rule TEXT,
    confidence_score INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE (source_system_id, source_field_id, sap_field_id)
);

-- ==========================================
-- Pipeline Execution Tables (Multi-Mock Supported)
-- Mock cycles: 'mock-0' (Present Flow), 'mock-1' (Agentic AI), 'mock-2' (Options)
-- ==========================================

-- Table: user_corrected_mappings (Step 2)
CREATE TABLE user_corrected_mappings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    source_system_id UUID NOT NULL REFERENCES source_systems(id) ON DELETE CASCADE,
    source_field_name TEXT NOT NULL,
    sap_field_id UUID NOT NULL REFERENCES sap_fields(id) ON DELETE CASCADE,
    transform_rule TEXT,
    confidence INTEGER,
    mock_cycle TEXT NOT NULL DEFAULT 'mock-0' CHECK (mock_cycle IN ('mock-0', 'mock-1', 'mock-2')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Table: extracted_data (Step 3)
CREATE TABLE extracted_data (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    object_id UUID NOT NULL REFERENCES sap_objects(id) ON DELETE CASCADE,
    mock_cycle TEXT NOT NULL DEFAULT 'mock-0' CHECK (mock_cycle IN ('mock-0', 'mock-1', 'mock-2')),
    payload JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Table: harmonized_data (Step 4)
CREATE TABLE harmonized_data (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    object_id UUID NOT NULL REFERENCES sap_objects(id) ON DELETE CASCADE,
    mock_cycle TEXT NOT NULL DEFAULT 'mock-0' CHECK (mock_cycle IN ('mock-0', 'mock-1', 'mock-2')),
    payload JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Table: validation_report (Step 5)
CREATE TABLE validation_report (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    object_id UUID NOT NULL REFERENCES sap_objects(id) ON DELETE CASCADE,
    mock_cycle TEXT NOT NULL DEFAULT 'mock-0' CHECK (mock_cycle IN ('mock-0', 'mock-1', 'mock-2')),
    payload JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Table: dynamic_rules (Step 5 & 6)
CREATE TABLE dynamic_rules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    object_id UUID NOT NULL REFERENCES sap_objects(id) ON DELETE CASCADE,
    source TEXT NOT NULL DEFAULT 'validate',
    mock_cycle TEXT NOT NULL DEFAULT 'mock-0' CHECK (mock_cycle IN ('mock-0', 'mock-1', 'mock-2')),
    payload JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (project_id, object_id, source, mock_cycle)
);

-- Table: cleansed_data (Step 6)
CREATE TABLE cleansed_data (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    object_id UUID NOT NULL REFERENCES sap_objects(id) ON DELETE CASCADE,
    mock_cycle TEXT NOT NULL DEFAULT 'mock-0' CHECK (mock_cycle IN ('mock-0', 'mock-1', 'mock-2')),
    payload JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Table: transformed_data (Step 7)
CREATE TABLE transformed_data (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    object_id UUID NOT NULL REFERENCES sap_objects(id) ON DELETE CASCADE,
    mock_cycle TEXT NOT NULL DEFAULT 'mock-0' CHECK (mock_cycle IN ('mock-0', 'mock-1', 'mock-2')),
    payload JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Table: tech_docs (Step 9)
CREATE TABLE tech_docs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    object_id UUID NOT NULL REFERENCES sap_objects(id) ON DELETE CASCADE,
    source_id UUID NOT NULL REFERENCES source_systems(id) ON DELETE CASCADE,
    source TEXT NOT NULL DEFAULT 'ORACLE_EBS',
    target_object TEXT NOT NULL DEFAULT 'CUSTOMER',
    project_name TEXT,
    object_name TEXT,
    source_name TEXT,
    report_title TEXT NOT NULL DEFAULT 'Consolidated Master Report',
    mock_cycle TEXT NOT NULL DEFAULT 'mock-0' CHECK (mock_cycle IN ('mock-0', 'mock-1', 'mock-2')),
    pipeline_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
    step_reports JSONB NOT NULL DEFAULT '{}'::jsonb,
    waterfall_stats JSONB NOT NULL DEFAULT '{}'::jsonb,
    comparison_stats JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (project_id, object_id, source_id, mock_cycle)
);

-- ==========================================
-- Enable RLS and Setup Policies
-- ==========================================

ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE sap_objects ENABLE ROW LEVEL SECURITY;
ALTER TABLE sap_fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE source_systems ENABLE ROW LEVEL SECURITY;
ALTER TABLE source_fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_mapping_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_corrected_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE extracted_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE harmonized_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE validation_report ENABLE ROW LEVEL SECURITY;
ALTER TABLE dynamic_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE cleansed_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE transformed_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE tech_docs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public Read Access for sap_objects" ON sap_objects FOR SELECT USING (true);
CREATE POLICY "Public Read Access for sap_fields" ON sap_fields FOR SELECT USING (true);
CREATE POLICY "Public Read Access for source_systems" ON source_systems FOR SELECT USING (true);
CREATE POLICY "Public Read Access for source_fields" ON source_fields FOR SELECT USING (true);
CREATE POLICY "Public Read Access for ai_mapping_cache" ON ai_mapping_cache FOR SELECT USING (true);

CREATE POLICY "Public Access for projects" ON projects FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public Access for mappings" ON user_corrected_mappings FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public Access for extracted_data" ON extracted_data FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public Access for harmonized_data" ON harmonized_data FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public Access for validation_report" ON validation_report FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public Access for dynamic_rules" ON dynamic_rules FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public Access for cleansed_data" ON cleansed_data FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public Access for transformed_data" ON transformed_data FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public Access for tech_docs" ON tech_docs FOR ALL USING (true) WITH CHECK (true);

-- Performance Indexes
CREATE INDEX IF NOT EXISTS idx_user_mappings_mock ON user_corrected_mappings(project_id, mock_cycle);
CREATE INDEX IF NOT EXISTS idx_extracted_mock ON extracted_data(project_id, object_id, mock_cycle);
CREATE INDEX IF NOT EXISTS idx_harmonized_mock ON harmonized_data(project_id, object_id, mock_cycle);
CREATE INDEX IF NOT EXISTS idx_validation_mock ON validation_report(project_id, object_id, mock_cycle);
CREATE INDEX IF NOT EXISTS idx_dynamic_rules_mock ON dynamic_rules(project_id, object_id, mock_cycle);
CREATE INDEX IF NOT EXISTS idx_cleansed_mock ON cleansed_data(project_id, object_id, mock_cycle);
CREATE INDEX IF NOT EXISTS idx_transformed_mock ON transformed_data(project_id, object_id, mock_cycle);
CREATE INDEX IF NOT EXISTS idx_tech_docs_mock ON tech_docs(project_id, object_id, mock_cycle);

