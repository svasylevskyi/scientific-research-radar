import re
from typing import Annotated

from pydantic import AfterValidator, Field


def validate_password_complexity(value: str) -> str:
    if not all(re.search(pattern, value) for pattern in (
        r"[A-Z]", r"[a-z]", r"[0-9]", r"[!-/:-@\[-`{-~]",
    )):
        raise ValueError(
            "Password must contain an uppercase letter (A-Z), a lowercase letter (a-z), "
            "a number (0-9), and a special character (such as !, @, #, or ?)."
        )
    return value


NewPassword = Annotated[
    str, Field(min_length=8, max_length=128), AfterValidator(validate_password_complexity)
]
