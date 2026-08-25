from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    app_name: str = "VoiceShield"
    environment: str = "development"
    secret_key: str = "changeme"
    supabase_url: str | None = None
    supabase_key: str | None = None

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()
