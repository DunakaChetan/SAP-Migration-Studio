import os
import logging
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()
logger = logging.getLogger(__name__)

class SupabaseServiceError(Exception):
    pass

class SupabaseService:
    def __init__(self) -> None:
        self.supabase_url = os.environ.get("SUPABASE_URL")
        self.supabase_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
        self.client: Client | None = None
        self.is_configured = bool(self.supabase_url and self.supabase_key)

    def start(self) -> None:
        if self.is_configured:
            # We use the Service Role Key so the backend can manage the database bypassing RLS
            self.client = create_client(self.supabase_url, self.supabase_key)
            logger.info("Supabase service initialized successfully")
        else:
            logger.warning("Supabase service NOT configured — URL or Keys missing")

    def stop(self) -> None:
        self.client = None
        logger.info("Supabase service stopped")

    def get_client(self) -> Client:
        if not self.is_configured or not self.client:
            raise SupabaseServiceError("Supabase service is not configured")
        return self.client

# Singleton instance
supabase_service = SupabaseService()
supabase_service.start()
