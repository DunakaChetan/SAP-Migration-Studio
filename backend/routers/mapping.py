from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from typing import List, Optional
import logging

from services.supabase_client import supabase_service
from services.llm_orchestrator import llm_orchestrator

logger = logging.getLogger(__name__)

router = APIRouter()

class MapRequest(BaseModel):
    sourceSystem: str
    targetObject: str
    sourceFields: List[str]

class MappingItem(BaseModel):
    src: str
    sap: str
    tr: str
    conf: int
    req: Optional[bool] = False
    sapLabel: Optional[str] = ""

class SaveAllRequest(BaseModel):
    projectId: str
    sourceSystem: str
    targetObject: str
    mappings: List[MappingItem]

class PromptRequest(BaseModel):
    prompt: str

@router.get("/schema")
def get_schema(object_name: str = "Customer"):
    client = supabase_service.get_client()
    # 1. Fetch object ID
    res_obj = client.table("sap_objects").select("id").eq("name", object_name).execute()
    if not res_obj.data:
        raise HTTPException(status_code=404, detail="SAP Object not found")
    
    obj_id = res_obj.data[0]["id"]
    
    # 2. Fetch fields
    res_fields = client.table("sap_fields").select("*").eq("object_id", obj_id).execute()
    return {"object_name": object_name, "fields": res_fields.data}

@router.post("/map")
def generate_mapping(req: MapRequest):
    client = supabase_service.get_client()
    
    res_obj = client.table("sap_objects").select("id").eq("name", req.targetObject).execute()
    if not res_obj.data:
        raise HTTPException(status_code=404, detail="SAP Object not found in database.")
    
    obj_id = res_obj.data[0]["id"]
    res_fields = client.table("sap_fields").select("*").eq("object_id", obj_id).execute()
    target_fields = res_fields.data
    
    # Only pass MANDATORY fields to the LLM to guarantee they are mapped and prevent timeouts
    # We DO NOT deduplicate mandatory fields so that the LLM explicitly maps every required instance
    mandatory_target_fields = []
    for f in target_fields:
        if f.get("is_mandatory") is True:
            mandatory_target_fields.append({
                "s": f["sap_structure"],
                "n": f["field_name"],
                "d": f["field_description"]
            })
            
    # Hybrid LLM Logic - Simplified for mapping
    known_source_fields = req.sourceFields
    
    raw_mappings = llm_orchestrator.map_source_to_target(
        source_system=req.sourceSystem,
        target_object=req.targetObject,
        known_source_fields=known_source_fields,
        target_fields=mandatory_target_fields
    )
    
    # Format for the frontend UI components
    formatted = []
    for m in raw_mappings:
        tr_rule = m.get("transform_rule", "none")
        if isinstance(tr_rule, str):
            if "Pad" in tr_rule:
                tr_rule = "pad10"
            elif "Country" in tr_rule:
                tr_rule = "country"
            elif "Currency" in tr_rule:
                tr_rule = "currency"
            else:
                tr_rule = "trim"
                
        formatted.append({
            "src": m.get("source_field"),
            "sap": m.get("target_field"),
            "tr": tr_rule,
            "conf": m.get("confidence", 0)
        })
    
    return {"mappings": formatted}

@router.post("/map/save_all")
def save_all_mappings(req: SaveAllRequest):
    client = supabase_service.get_client()
    
    sys_res = client.table("source_systems").select("id").eq("name", req.sourceSystem).execute()
    if not sys_res.data:
        raise HTTPException(404, "Source system not found")
    sys_id = sys_res.data[0]["id"]
    
    obj_res = client.table("sap_objects").select("id").eq("name", req.targetObject).execute()
    if not obj_res.data:
        raise HTTPException(404, "Target object not found")
    obj_id = obj_res.data[0]["id"]
    
    fields_res = client.table("sap_fields").select("id, field_name, sap_structure").eq("object_id", obj_id).execute()
    field_map = {}
    for f in fields_res.data:
        full_name = f"{f['sap_structure']}.{f['field_name']}"
        if full_name not in field_map:
            field_map[full_name] = []
        field_map[full_name].append(f["id"])
        
    # Delete old mappings for this object in this project to replace them cleanly
    existing = client.table("user_corrected_mappings") \
        .select("id, sap_fields!inner(object_id)") \
        .eq("project_id", req.projectId) \
        .eq("source_system_id", sys_id) \
        .eq("sap_fields.object_id", obj_id) \
        .execute()
        
    ids_to_delete = [row["id"] for row in existing.data]
    if ids_to_delete:
        # Delete in chunks if there are too many, but usually it's < 500
        client.table("user_corrected_mappings").delete().in_("id", ids_to_delete).execute()
        
    inserts = []
    for i, m in enumerate(req.mappings):
        if not m.src:
            continue
        if m.sap in field_map:
            # We ONLY map to the FIRST fid to avoid exploding one UI row into multiple DB rows
            fid = field_map[m.sap][0]
            inserts.append({
                "project_id": req.projectId,
                "source_system_id": sys_id,
                # Append order index to bypass UNIQUE constraint and preserve order
                "source_field_name": f"[{i}]{m.src}",
                "sap_field_id": fid,
                "transform_rule": m.tr,
                "confidence": getattr(m, 'conf', 100)
            })
                
    if inserts:
        client.table("user_corrected_mappings").insert(inserts).execute()
        
    return {"status": "success", "inserted": len(inserts)}

@router.get("/map/history")
def get_mapping_history(project_id: str, source_system: str, target_object: str):
    client = supabase_service.get_client()
    
    sys_res = client.table("source_systems").select("id").eq("name", source_system).execute()
    if not sys_res.data:
        return {"mappings": []}
    sys_id = sys_res.data[0]["id"]
    
    obj_res = client.table("sap_objects").select("id").eq("name", target_object).execute()
    if not obj_res.data:
        return {"mappings": []}
    obj_id = obj_res.data[0]["id"]
    
    # Get project mappings
    res = client.table("user_corrected_mappings") \
        .select("source_field_name, transform_rule, confidence, sap_fields!inner(field_name, sap_structure, object_id)") \
        .eq("project_id", project_id) \
        .eq("source_system_id", sys_id) \
        .eq("sap_fields.object_id", obj_id) \
        .execute()
        
    import re
    mappings_with_order = []
    for r in res.data:
        raw_src = r["source_field_name"]
        match = re.match(r"^\[(\d+)\](.*)$", raw_src)
        if match:
            idx = int(match.group(1))
            src = match.group(2)
        else:
            idx = 99999
            src = raw_src
            
        mappings_with_order.append({
            "idx": idx,
            "src": src,
            "sap": f"{r['sap_fields']['sap_structure']}.{r['sap_fields']['field_name']}",
            "tr": r["transform_rule"],
            "conf": r.get("confidence") if r.get("confidence") is not None else 100
        })
        
    mappings_with_order.sort(key=lambda x: x["idx"])
    final_mappings = [{"src": m["src"], "sap": m["sap"], "tr": m["tr"], "conf": m["conf"]} for m in mappings_with_order]
            
    return {"mappings": final_mappings}

@router.post("/prompt")
def generic_prompt(req: PromptRequest):
    # Uses the LLM fallback chain for generic text generation (Steps 3,4,7,8)
    system_prompt = "You are a senior SAP S/4HANA data migration consultant with 20 years of hands-on experience."
    
    # We will just reuse the orchestration logic by manually wrapping the prompt
    # Note: LLMOrchestrator's map_source_to_target is specific to mapping.
    # We need to add a generic generate() to the orchestrator. Let's do that next.
    from services.llm_orchestrator import llm_orchestrator
    result = llm_orchestrator.generate_generic(system_prompt, req.prompt)
    return {"content": result}
