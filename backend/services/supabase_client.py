import os
import logging
from dotenv import load_dotenv

load_dotenv()
logger = logging.getLogger(__name__)

# 1. Patch httpx to disable HTTP/2 and prevent stale keepalive connections
import httpx
original_init = httpx.Client.__init__
def new_init(self, *args, **kwargs):
    kwargs['http2'] = False
    if 'limits' not in kwargs:
        kwargs['limits'] = httpx.Limits(max_keepalive_connections=5, max_connections=20, keepalive_expiry=5.0)
    if 'timeout' not in kwargs:
        kwargs['timeout'] = httpx.Timeout(30.0, connect=10.0)
    original_init(self, *args, **kwargs)
httpx.Client.__init__ = new_init

# 2. Patch PostgREST execute to auto-retry once if a dropped/idle connection error occurs
try:
    from postgrest._sync.request_builder import SyncRequestBuilder
    original_postgrest_execute = SyncRequestBuilder.execute

    def robust_postgrest_execute(self, *args, **kwargs):
        try:
            return original_postgrest_execute(self, *args, **kwargs)
        except Exception as exc:
            err_msg = str(exc).lower()
            if any(term in err_msg for term in ["disconnected", "connection", "protocol", "reset by peer", "eof", "timeout"]):
                logger.warning(f"PostgREST execute encountered connection issue ({exc}), retrying with fresh socket...")
                if hasattr(self, "session") and hasattr(self.session, "_transport"):
                    try:
                        self.session._transport.close()
                    except Exception:
                        pass
                return original_postgrest_execute(self, *args, **kwargs)
            raise exc

    SyncRequestBuilder.execute = robust_postgrest_execute
except Exception as patch_err:
    logger.debug(f"Could not patch PostgREST execute: {patch_err}")

from supabase import create_client, Client

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
            try:
                # We use the Service Role Key so the backend can manage the database bypassing RLS
                self.client = create_client(self.supabase_url, self.supabase_key)
                logger.info("Supabase service initialized successfully")
            except Exception as e:
                logger.error(f"Failed to initialize Supabase client: {e}")
        else:
            logger.warning("Supabase service NOT configured — URL or Keys missing")

    def stop(self) -> None:
        self.client = None
        logger.info("Supabase service stopped")

    def refresh_client(self) -> Client:
        if self.is_configured:
            try:
                self.client = create_client(self.supabase_url, self.supabase_key)
                logger.info("Supabase client connection refreshed")
            except Exception as e:
                logger.warning(f"Failed to refresh Supabase client: {e}")
        return self.get_client()

    def get_client(self) -> Client:
        if not self.is_configured or not self.client:
            raise SupabaseServiceError("Supabase service is not configured")
        return self.client

# Singleton instance
supabase_service = SupabaseService()
supabase_service.start()

