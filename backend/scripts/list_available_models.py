import os
import requests
from dotenv import load_dotenv

def get_gemini_models(api_key):
    if not api_key:
        return []
    try:
        url = f"https://generativelanguage.googleapis.com/v1beta/models?key={api_key}"
        res = requests.get(url)
        if res.ok:
            data = res.json()
            models = []
            for model in data.get('models', []):
                name = model.get('name', '').replace('models/', '')
                tokens = model.get('inputTokenLimit', 'Unknown')
                models.append((name, "N/A", "N/A", str(tokens)))
            return models
        return []
    except Exception as e:
        return []

def get_groq_models(api_key):
    if not api_key:
        return []
    try:
        url = "https://api.groq.com/openai/v1/models"
        headers = {"Authorization": f"Bearer {api_key}"}
        res = requests.get(url, headers=headers)
        if res.ok:
            data = res.json()
            models = []
            for model in data.get('data', []):
                name = model.get('id', '')
                tokens = model.get('context_window', 'Unknown')
                models.append((name, "N/A", "N/A", str(tokens)))
            return models
        return []
    except Exception as e:
        return []

def get_openrouter_models(api_key):
    if not api_key:
        return []
    try:
        url = "https://openrouter.ai/api/v1/models"
        headers = {"Authorization": f"Bearer {api_key}"}
        res = requests.get(url, headers=headers)
        if res.ok:
            data = res.json()
            models = []
            for model in data.get('data', []):
                name = model.get('id', '')
                tokens = model.get('context_length', 'Unknown')
                
                pricing = model.get('pricing', {})
                prompt_price = pricing.get('prompt', '1')
                completion_price = pricing.get('completion', '1')
                
                if prompt_price == "0" and completion_price == "0" or ":free" in name:
                    models.append((name, "N/A", "N/A", str(tokens)))
            return models
        return []
    except Exception as e:
        return []

def print_table(f, models_list):
    f.write(f"{'Model'.ljust(45)} {'TPM'.ljust(15)} {'TPD'.ljust(15)} {'Tokens'.ljust(15)}\n")
    f.write("-" * 90 + "\n")
    for name, tpm, tpd, tokens in models_list:
        f.write(f"{name.ljust(45)} {tpm.ljust(15)} {tpd.ljust(15)} {tokens.ljust(15)}\n")
    f.write("\n")

def main():
    env_path = os.path.abspath(os.path.join(os.path.dirname(__file__), '../.env'))
    load_dotenv(dotenv_path=env_path)
    
    gemini_key = os.getenv("GEMINI_API_KEY")
    groq_key = os.getenv("GROQ_API_KEY")
    openrouter_key = os.getenv("OPENROUTER_API_KEY")
    
    print("Fetching Gemini models...")
    gemini_models = get_gemini_models(gemini_key)
    
    print("Fetching Groq models...")
    groq_models = get_groq_models(groq_key)
    
    print("Fetching FREE OpenRouter models...")
    openrouter_models = get_openrouter_models(openrouter_key)
    
    output_file = os.path.join(os.path.dirname(__file__), '../free_models.txt')
    with open(output_file, "w", encoding="utf-8") as f:
        f.write("=== Gemini (All available models are free on Developer API) ===\n")
        print_table(f, gemini_models)
            
        f.write("=== Groq (All available models are free) ===\n")
        print_table(f, groq_models)
            
        f.write("=== OpenRouter (Only 100% FREE models) ===\n")
        print_table(f, openrouter_models)
            
    print(f"Successfully generated {output_file}!")

if __name__ == "__main__":
    main()
