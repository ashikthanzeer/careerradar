import importlib.util
import logging
from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict

logger = logging.getLogger(__name__)

# Resolve repository root .env (careerintelligence/.env) and apps/api/.env
_API_DIR = Path(__file__).resolve().parents[2]
_ROOT_DIR = Path(__file__).resolve().parents[4]
_ROOT_ENV = _ROOT_DIR / ".env"
_API_ENV = _API_DIR / ".env"


class Settings(BaseSettings):
    """Centralized backend configuration loaded from environment variables."""

    app_name: str = "CareerRadar API"
    version: str = "1.0.0"
    environment: str = "production"

    database_url: str = "sqlite:///./career_intelligence.db"
    direct_url: str = ""
    frontend_url: str = "http://localhost:5173"
    allowed_origins: str = "http://localhost:5173,http://127.0.0.1:5173,https://careerradar-web.vercel.app"

    # JWT Security & Persistent Device Session (30 days)
    jwt_secret_key: str = "careerradar-production-hmac-sha256-secret-key-2026"
    jwt_expire_minutes: int = 60 * 24 * 30  # 30 days

    # OAuth 2.0 Provider (Google)
    google_client_id: str = ""
    google_client_secret: str = ""
    google_redirect_uri: str = "http://localhost:5173/auth/callback?provider=google"

    # Optional server-side AI provider keys (Groq)
    groq_api_key: str = ""
    groq_model: str = "llama-3.3-70b-versatile"
    groq_api_base_url: str = "https://api.groq.com/openai/v1"

    model_config = SettingsConfigDict(
        env_file=(str(_ROOT_ENV), str(_API_ENV), ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @staticmethod
    def _normalize_pg_url(raw_url: str, use_psycopg3: bool) -> str:
        url = raw_url.strip()
        if not url:
            return url
        if use_psycopg3:
            if url.startswith("postgres://"):
                return "postgresql+psycopg://" + url[len("postgres://") :]
            if url.startswith("postgresql://"):
                return "postgresql+psycopg://" + url[len("postgresql://") :]
        return url

    def model_post_init(self, __context: object) -> None:
        """Fall back to local SQLite when PostgreSQL drivers are unavailable, or normalize psycopg scheme."""
        if not self.database_url.startswith(("postgres://", "postgresql")):
            if not self.direct_url:
                self.direct_url = self.database_url
            return

        has_psycopg = importlib.util.find_spec("psycopg") is not None
        has_psycopg2 = importlib.util.find_spec("psycopg2") is not None
        if not has_psycopg and not has_psycopg2:
            logger.warning(
                "PostgreSQL DATABASE_URL configured but neither psycopg nor psycopg2 is installed; "
                "falling back to persistent local SQLite (sqlite:///./career_intelligence.db)."
            )
            self.database_url = "sqlite:///./career_intelligence.db"
            self.direct_url = self.database_url
            return

        use_psycopg3 = has_psycopg and not has_psycopg2 or has_psycopg
        self.database_url = self._normalize_pg_url(self.database_url, use_psycopg3)
        if self.direct_url:
            self.direct_url = self._normalize_pg_url(self.direct_url, use_psycopg3)
        else:
            self.direct_url = self.database_url


settings = Settings()
