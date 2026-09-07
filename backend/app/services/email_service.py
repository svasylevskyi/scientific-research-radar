"""Reusable plain-text/HTML email delivery via configured SMTP."""
from dataclasses import dataclass
from email.message import EmailMessage
import smtplib
import ssl

from app.core.config import Settings


class EmailDeliveryError(Exception):
    pass


@dataclass(frozen=True)
class OutgoingEmail:
    recipient: str
    subject: str
    text: str
    html: str | None = None


class EmailService:
    def __init__(self, settings: Settings):
        self.settings = settings

    def send(self, email: OutgoingEmail) -> None:
        settings = self.settings
        if not settings.smtp_host or not settings.email_from:
            raise EmailDeliveryError("Email delivery is not configured. Please contact support.")
        message = EmailMessage()
        message["From"] = str(settings.email_from)
        message["To"] = email.recipient
        message["Subject"] = email.subject
        message.set_content(email.text)
        if email.html:
            message.add_alternative(email.html, subtype="html")
        try:
            transport = smtplib.SMTP_SSL if settings.smtp_security == "ssl" else smtplib.SMTP
            options = {"timeout": settings.smtp_timeout_seconds}
            if settings.smtp_security == "ssl":
                options["context"] = ssl.create_default_context()
            with transport(settings.smtp_host, settings.smtp_port, **options) as smtp:
                if settings.smtp_security == "starttls":
                    smtp.starttls(context=ssl.create_default_context())
                if settings.smtp_username:
                    smtp.login(settings.smtp_username, settings.smtp_password.get_secret_value() if settings.smtp_password else "")
                if smtp.send_message(message):
                    raise EmailDeliveryError("The email could not be sent. Please try again.")
        except (OSError, smtplib.SMTPException) as exc:
            raise EmailDeliveryError("The email could not be sent. Please try again.") from exc
