from functools import lru_cache
from typing import Literal

from pydantic import EmailStr, Field, SecretStr, model_validator, field_validator
from urllib.parse import urlsplit
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    app_name: str = "Scientific Research Radar API"
    environment: Literal["development", "test", "production"] = "development"
    database_url: str = "sqlite:///./data/research_radar.db"

    smtp_host: str | None = None
    smtp_port: int = Field(default=587, ge=1, le=65535)
    smtp_username: str | None = None
    smtp_password: SecretStr | None = None
    smtp_security: Literal["starttls", "ssl", "none"] = "starttls"
    smtp_timeout_seconds: float = Field(default=15, ge=1, le=60)
    email_from: EmailStr | None = None
    frontend_base_url: str = "http://localhost:5173"
    scheduler_poll_seconds: float = Field(default=10, ge=1, le=300)

    @field_validator("frontend_base_url")
    @classmethod
    def validate_frontend_url(cls, value: str) -> str:
        parsed = urlsplit(value)
        if parsed.scheme not in ("http", "https") or not parsed.hostname or parsed.username or parsed.password or parsed.query or parsed.fragment:
            raise ValueError("FRONTEND_BASE_URL must be an HTTP(S) URL without credentials, query, or fragment")
        return value.rstrip("/")

    jwt_secret: str = "development-only-secret-change-me"
    jwt_algorithm: Literal["HS256", "HS384", "HS512"] = "HS256"
    jwt_issuer: str = "scientific-research-radar"
    jwt_audience: str = "scientific-research-radar-web"
    access_token_minutes: int = Field(default=15, ge=1, le=1440)
    session_absolute_days: int = Field(default=30, ge=1, le=90)
    refresh_race_grace_seconds: int = Field(default=10, ge=1, le=30)
    radar_runs_per_hour: int = Field(default=5, ge=1, le=100)
    radar_runs_per_day: int = Field(default=20, ge=1, le=1000)
    refresh_token_days: int = Field(default=7, ge=1, le=90)

    refresh_cookie_name: str = "research_radar_refresh"
    refresh_cookie_secure: bool = False
    refresh_cookie_samesite: Literal["lax", "strict", "none"] = "lax"
    cors_origins: list[str] = Field(default_factory=lambda: ["http://localhost:5173"])

    openai_admin_api_key: SecretStr | None = None
    openai_costs_project_id: str | None = Field(default=None, min_length=1, max_length=200)
    stripe_sandbox_api_key: SecretStr | None = None
    subscription_grace_days: int = Field(default=3, ge=0, le=14)
    subscription_sync_max_age_seconds: int = Field(default=86400, ge=900, le=172800)
    stripe_sync_poll_seconds: int = Field(default=5, ge=1, le=60)
    stripe_sync_reconcile_seconds: int = Field(default=900, ge=60, le=86400)
    stripe_sync_max_failures: int = Field(default=8, ge=1, le=20)
    stripe_sandbox_checkout_enabled: bool = False
    stripe_sandbox_webhook_secret: SecretStr | None = None
    stripe_sandbox_portal_configuration_id: str | None = None
    openai_api_key: SecretStr | None = None
    openai_radar_model: str = Field(default="gpt-6-astra", min_length=1, max_length=100)
    openai_radar_discovery_reasoning_effort: Literal["low", "medium", "high", "xhigh"] = "medium"
    openai_radar_summary_reasoning_effort: Literal["low", "medium", "high", "xhigh"] = "low"
    openai_radar_trend_reasoning_effort: Literal["low", "medium", "high", "xhigh"] = "medium"
    openai_radar_briefing_reasoning_effort: Literal["low", "medium", "high", "xhigh"] = "low"
    openai_request_timeout_seconds: float = Field(default=60, ge=15, le=300)
    openai_background_poll_timeout_seconds: float = Field(default=900, ge=60, le=3600)
    openai_background_poll_interval_seconds: float = Field(default=2, ge=0.5, le=10)
    openai_radar_max_output_tokens: int = Field(default=30000, ge=1000, le=128000)
    openai_radar_max_search_tool_calls: int = Field(default=8, ge=1, le=20)
    openai_radar_search_context_size: Literal["low", "medium", "high"] = "medium"
    openai_radar_summary_batch_size: int = Field(default=5, ge=1, le=10)
    radar_history_runs: int = Field(default=3, ge=0, le=20)
    radar_worker_poll_interval_seconds: float = Field(default=1, ge=0.2, le=30)
    radar_worker_lease_seconds: int = Field(default=120, ge=30, le=600)

    super_admin_email: EmailStr = "admin@example.com"
    super_admin_full_name: str = Field(default="System Administrator", min_length=2, max_length=120)
    super_admin_password: str = Field(default="change-me-before-production", min_length=12, max_length=128)

    @model_validator(mode="after")
    def validate_production_security(self) -> "Settings":
        if self.refresh_cookie_samesite == "none" and not self.refresh_cookie_secure:
            raise ValueError("SameSite=None refresh cookies must also be Secure")
        if self.environment == "production":
            if len(self.jwt_secret) < 48 or "change-me" in self.jwt_secret:
                raise ValueError("JWT_SECRET must be a long random value in production")
            if not self.refresh_cookie_secure:
                raise ValueError("REFRESH_COOKIE_SECURE must be true in production")
            if len(self.super_admin_password) < 16 or "change-me" in self.super_admin_password.lower():
                raise ValueError("SUPER_ADMIN_PASSWORD must be a strong, non-default value in production")
        if self.radar_worker_lease_seconds < self.openai_request_timeout_seconds + 15:
            raise ValueError(
                "RADAR_WORKER_LEASE_SECONDS must be at least 15 seconds longer "
                "than OPENAI_REQUEST_TIMEOUT_SECONDS"
            )
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
