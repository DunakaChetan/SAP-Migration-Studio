import logging
import json
import os
import requests
import concurrent.futures

logger = logging.getLogger(__name__)

# Fetch API Keys from Environment
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")
GROQ_API_KEY = os.environ.get("GROQ_API_KEY")
OPENROUTER_API_KEY = os.environ.get("OPENROUTER_API_KEY")

# Fallback Configuration
PRIMARY_PROVIDER = os.environ.get("PRIMARY_PROVIDER")
PRIMARY_MODEL = os.environ.get("PRIMARY_MODEL")
SECONDARY_PROVIDER = os.environ.get("SECONDARY_PROVIDER")
SECONDARY_MODEL = os.environ.get("SECONDARY_MODEL")
THIRD_PROVIDER = os.environ.get("THIRD_PROVIDER")
THIRD_MODEL = os.environ.get("THIRD_MODEL")
FOURTH_PROVIDER = os.environ.get("FOURTH_PROVIDER")
FOURTH_MODEL = os.environ.get("FOURTH_MODEL")
FIFTH_PROVIDER = os.environ.get("FIFTH_PROVIDER")
FIFTH_MODEL = os.environ.get("FIFTH_MODEL")
SIXTH_PROVIDER = os.environ.get("SIXTH_PROVIDER")
SIXTH_MODEL = os.environ.get("SIXTH_MODEL")


def _call_gemini(model: str, system_prompt: str, user_prompt: str, api_key: str | None = None) -> str:
    key = api_key or os.environ.get("GEMINI_API_KEY")
    if not key:
        raise ValueError("GEMINI_API_KEY is missing.")
        
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={key}"
    payload = {
        "system_instruction": {"parts": [{"text": system_prompt}]},
        "contents": [{"parts": [{"text": user_prompt}]}],
        "generationConfig": {"responseMimeType": "application/json"}
    }
    
    response = requests.post(url, headers={"Content-Type": "application/json"}, json=payload, timeout=(10, 45))
    response.raise_for_status()
    
    data = response.json()
    try:
        return data["candidates"][0]["content"]["parts"][0]["text"]
    except (KeyError, IndexError) as e:
        raise ValueError(f"Unexpected response format from Gemini: {data}") from e


def _call_openai_compatible(url: str, api_key: str | None, model: str, system_prompt: str, user_prompt: str) -> str:
    if not api_key:
        raise ValueError("API Key is missing for this provider.")
        
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }
    
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ],
        "response_format": {"type": "json_object"}
    }
    
    response = requests.post(url, headers=headers, json=payload, timeout=(10, 45))
    response.raise_for_status()
    
    data = response.json()
    try:
        return data["choices"][0]["message"]["content"]
    except (KeyError, IndexError) as e:
        raise ValueError(f"Unexpected response format: {data}") from e


def _route_provider(provider: str, model: str, system_prompt: str, user_prompt: str) -> str:
    provider_lower = provider.lower()
    if "gemini" in provider_lower:
        return _call_gemini(model, system_prompt, user_prompt, api_key=os.environ.get("GEMINI_API_KEY"))
    elif "groq" in provider_lower:
        return _call_openai_compatible("https://api.groq.com/openai/v1/chat/completions", os.environ.get("GROQ_API_KEY"), model, system_prompt, user_prompt)
    elif "openrouter" in provider_lower:
        return _call_openai_compatible("https://openrouter.ai/api/v1/chat/completions", os.environ.get("OPENROUTER_API_KEY"), model, system_prompt, user_prompt)
    else:
        raise ValueError(f"Unknown provider configured: {provider}")


def _get_chain():
    return [
        {"tier": "PRIMARY", "provider": os.environ.get("PRIMARY_PROVIDER", "gemini"), "model": os.environ.get("PRIMARY_MODEL", "gemini-flash-latest")},
        {"tier": "SECONDARY", "provider": os.environ.get("SECONDARY_PROVIDER", "gemini"), "model": os.environ.get("SECONDARY_MODEL", "gemini-flash-lite-latest")},
        {"tier": "THIRD", "provider": os.environ.get("THIRD_PROVIDER", "groq"), "model": os.environ.get("THIRD_MODEL", "qwen/qwen3.8-27b")},
        {"tier": "FOURTH", "provider": os.environ.get("FOURTH_PROVIDER", "groq"), "model": os.environ.get("FOURTH_MODEL", "openai/gpt-oss-20b")},
        {"tier": "FIFTH", "provider": os.environ.get("FIFTH_PROVIDER", "openrouter"), "model": os.environ.get("FIFTH_MODEL", "google/gemma-4-31b-it:free")},
        {"tier": "SIXTH", "provider": os.environ.get("SIXTH_PROVIDER", "openrouter"), "model": os.environ.get("SIXTH_MODEL", "google/gemma-4-26b-a4b-it:free")},
    ]


class LLMOrchestrator:
    def execute_json_prompt(self, system_prompt: str, user_prompt: str):
        chain = _get_chain()

        for step in chain:
            provider = step["provider"]
            model = step["model"]
            if not provider or not model:
                continue
            
            print(f"\n🚀 [LLM ENGINE] LLM triggered -> Routing Request to {step['tier']} Tier -> Provider: {provider.upper()} | Model: {model}\n")
            logger.info(f"Attempting {step['tier']} LLM: {provider.upper()} (Model: {model})")
            try:
                result = _route_provider(provider, model, system_prompt, user_prompt)
                
                # Clean markdown formatting if present
                clean_result = result.replace("```json", "").replace("```", "").strip()
                
                try:
                    return json.loads(clean_result)
                except json.JSONDecodeError:
                    import re
                    json_match = re.search(r'(\{.*\}|\[.*\])', clean_result, re.DOTALL)
                    if json_match:
                        return json.loads(json_match.group(1))
                    raise
            except Exception as e:
                print(f"Failed using {provider.upper()} ({model}). Reason: {e}")
                logger.warning(f"Failed using {provider.upper()} ({model}). Reason: {e}")
                
        logger.error("ALL LLM PROVIDERS IN THE FALLBACK CHAIN FAILED.")
        return []

    def generate_generic(self, system_prompt: str, user_prompt: str) -> str:
        chain = _get_chain()
        for step in chain:
            provider = step["provider"]
            model = step["model"]
            if not provider or not model:
                continue
            
            print(f"\n🚀 [LLM ENGINE] LLM triggered -> Routing Request to {step['tier']} Tier -> Provider: {provider.upper()} | Model: {model}\n")
            logger.info(f"Attempting {step['tier']} LLM for generic prompt: {provider.upper()}")
            try:
                result = _route_provider(provider, model, system_prompt, user_prompt)
                return result
            except Exception as e:
                print(f"Failed using {provider.upper()} ({model}). Reason: {e}")
                logger.warning(f"Failed using {provider.upper()} ({model}). Reason: {e}")
                
        return '{"error": "All LLM providers failed"}'

    def execute_json_ensemble(self, system_prompt: str, user_prompt: str) -> list:
        chain = _get_chain()
        all_mappings = []
        
        def call_provider(step, index):
            import time
            time.sleep(index * 3.5)  # Stagger requests by 3.5 seconds to prevent 429 Too Many Requests
            
            provider = step["provider"]
            model = step["model"]
            if not provider or not model:
                return None
            
            print(f"\n🚀 [LLM ENGINE ENSEMBLE] Triggering -> Provider: {provider.upper()} | Model: {model}\n")
            logger.info(f"Ensemble Execution: Attempting {provider.upper()} (Model: {model})")
            
            try:
                result = _route_provider(provider, model, system_prompt, user_prompt)
                clean_result = result.replace("```json", "").replace("```", "").strip()
                
                parsed_json = None
                try:
                    parsed_json = json.loads(clean_result)
                except json.JSONDecodeError:
                    import re
                    json_match = re.search(r'(\{.*\}|\[.*\])', clean_result, re.DOTALL)
                    if json_match:
                        parsed_json = json.loads(json_match.group(1))
                        
                if isinstance(parsed_json, list):
                    return parsed_json
                elif isinstance(parsed_json, dict) and "mappings" in parsed_json:
                    return parsed_json["mappings"]
                return None
            except Exception as e:
                print(f"Ensemble: Failed using {provider.upper()} ({model}). Reason: {e}")
                logger.warning(f"Ensemble: Failed using {provider.upper()} ({model}). Reason: {e}")
                return None

        # Execute all LLM calls simultaneously
        with concurrent.futures.ThreadPoolExecutor(max_workers=len(chain)) as executor:
            future_to_step = {executor.submit(call_provider, step, idx): step for idx, step in enumerate(chain)}
            for future in concurrent.futures.as_completed(future_to_step):
                res = future.result()
                if res:
                    all_mappings.append(res)

        if not all_mappings:
            logger.error("ALL LLM PROVIDERS IN THE ENSEMBLE FAILED.")
            return []

        # Merge mappings based on target_field, prioritizing highest confidence
        merged_map = {}
        for mapping_array in all_mappings:
            for mapping in mapping_array:
                if not isinstance(mapping, dict):
                    continue
                
                target_field = mapping.get("target_field")
                if not target_field:
                    continue
                
                confidence = mapping.get("confidence", 0)
                try:
                    confidence = int(confidence)
                except (ValueError, TypeError):
                    confidence = 0
                
                if target_field not in merged_map:
                    merged_map[target_field] = mapping
                else:
                    existing_confidence = merged_map[target_field].get("confidence", 0)
                    try:
                        existing_confidence = int(existing_confidence)
                    except (ValueError, TypeError):
                        existing_confidence = 0
                        
                    if confidence > existing_confidence:
                        merged_map[target_field] = mapping

        return list(merged_map.values())

llm_orchestrator = LLMOrchestrator()
