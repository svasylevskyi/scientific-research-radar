from pydantic import BaseModel, EmailStr, Field, field_validator, model_validator
from app.schemas.password import NewPassword


class PasswordRecoveryRequest(BaseModel):
    email: EmailStr

    @field_validator("email", mode="before")
    @classmethod
    def normalize_email(cls, value):
        return value.strip().lower() if isinstance(value, str) else value


class PasswordResetRequest(BaseModel):
    token: str = Field(pattern=r"^[A-Za-z0-9_-]{43}$", min_length=43, max_length=43)
    password: NewPassword
    password_confirmation: str = Field(min_length=8, max_length=128)

    @model_validator(mode="after")
    def matching_passwords(self):
        if self.password != self.password_confirmation:
            raise ValueError("Passwords do not match")
        return self
