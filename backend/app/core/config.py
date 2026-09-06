from functools import lru_cache
from typing import Literal

from pydantic import EmailStr, Field, SecretStr, model_validator
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

    jwt_secret: str = "development-only-secret-change-me"
    jwt_algorithm: Literal["HS256", "HS384", "HS512"] = "HS256"
    jwt_issuer: str = "scientific-research-radar"
    jwt_audience: str = "scientific-research-radar-web"
    access_token_minutes: int = Field(default=15, ge=1, le=1440)
    refresh_token_days: int = Field(default=7, ge=1, le=90)

    refresh_cookie_name: str = "research_radar_refresh"
    refresh_cookie_secure: bool = False
    refresh_cookie_samesite: Literal["lax", "strict", "none"] = "lax"
    cors_origins: list[str] = Field(default_factory=lambda: ["http://localhost:5173"])

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
