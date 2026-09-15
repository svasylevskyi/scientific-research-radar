"""Stable errors shared by submission, validation, and the runner."""

from app.radar.client import RadarClientError


class RadarDigestNotFoundError(ValueError):
    pass


class RadarRunAlreadyActiveError(ValueError):
    pass


class RadarRunNotRetryableError(ValueError):
    pass


class RadarOutputValidationError(RadarClientError):
    """A completed response cannot be reused because its output was rejected."""
