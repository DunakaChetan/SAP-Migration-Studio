-- ==========================================
-- Drop existing tables to allow clean re-runs
-- ==========================================
DROP TABLE IF EXISTS cleansed_data CASCADE;
DROP TABLE IF EXISTS validation_report CASCADE;
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
-- Table Definitions
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

-- Table: user_corrected_mappings
CREATE TABLE user_corrected_mappings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    source_system_id UUID NOT NULL REFERENCES source_systems(id) ON DELETE CASCADE,
    source_field_name TEXT NOT NULL,
    sap_field_id UUID NOT NULL REFERENCES sap_fields(id) ON DELETE CASCADE,
    transform_rule TEXT,
    confidence INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Table: extracted_data
CREATE TABLE extracted_data (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    object_id UUID NOT NULL REFERENCES sap_objects(id) ON DELETE CASCADE,
    payload JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);


-- ==========================================
-- Enable RLS and Setup Policies
-- ==========================================

-- Enable RLS for all tables
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE sap_objects ENABLE ROW LEVEL SECURITY;
ALTER TABLE sap_fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE source_systems ENABLE ROW LEVEL SECURITY;
ALTER TABLE source_fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_mapping_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_corrected_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE extracted_data ENABLE ROW LEVEL SECURITY;

-- Policies for public read access to foundational schema data
CREATE POLICY "Public Read Access for sap_objects" ON sap_objects FOR SELECT USING (true);
CREATE POLICY "Public Read Access for sap_fields" ON sap_fields FOR SELECT USING (true);
CREATE POLICY "Public Read Access for source_systems" ON source_systems FOR SELECT USING (true);
CREATE POLICY "Public Read Access for source_fields" ON source_fields FOR SELECT USING (true);
CREATE POLICY "Public Read Access for ai_mapping_cache" ON ai_mapping_cache FOR SELECT USING (true);

-- Policy for projects
CREATE POLICY "Public Access for projects" ON projects
    FOR ALL USING (true) WITH CHECK (true);

-- Policy for user_corrected_mappings
CREATE POLICY "Public Access for mappings" ON user_corrected_mappings
    FOR ALL USING (true) WITH CHECK (true);

-- Policy for extracted_data
CREATE POLICY "Public Access for extracted_data" ON extracted_data
    FOR ALL USING (true) WITH CHECK (true);

-- ==========================================
-- STEP 6: Harmonized Data Storage
-- ==========================================

CREATE TABLE IF NOT EXISTS harmonized_data (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    object_id UUID REFERENCES sap_objects(id) ON DELETE CASCADE,
    payload JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE harmonized_data ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public Access for harmonized_data" ON harmonized_data
    FOR ALL USING (true) WITH CHECK (true);

-- ==========================================
-- STEP 7: Validation Report Storage
-- ==========================================

CREATE TABLE IF NOT EXISTS validation_report (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    object_id UUID REFERENCES sap_objects(id) ON DELETE CASCADE,
    payload JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE validation_report ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public Access for validation_report" ON validation_report
    FOR ALL USING (true) WITH CHECK (true);

-- ==========================================
-- STEP 8: Cleansed Data Storage
-- ==========================================

CREATE TABLE IF NOT EXISTS cleansed_data (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    object_id UUID REFERENCES sap_objects(id) ON DELETE CASCADE,
    payload JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE cleansed_data ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public Access for cleansed_data" ON cleansed_data
    FOR ALL USING (true) WITH CHECK (true);
