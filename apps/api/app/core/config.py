from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Centralized backend configuration loaded from environment variables."""

    app_name: str = "CareerRadar API"
    version: str = "1.0.0"
    environment: str = "production"

    database_url: str = "sqlite:///./career_intelligence.db"
    frontend_url: str = "http://localhost:5173"
    allowed_origins: str = "http://localhost:5173,http://127.0.0.1:5173"

    # JWT Security
    jwt_secret_key: str = "careerradar-production-hmac-sha256-secret-key-2026"
    jwt_expire_minutes: int = 60 * 24 * 7  # 7 days

    # OAuth 2.0 Provider (Google)
    google_client_id: str = ""
    google_client_secret: str = ""
    google_redirect_uri: str = "http://localhost:5173/auth/callback?provider=google"

    # Optional server-side AI provider keys
    gemini_api_key: str = ""
    gemini_model: str = "gemini-4-hydrogen"

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


settings = Settings()
