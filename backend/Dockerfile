FROM python:3.12-slim-bookworm
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1
WORKDIR /app
COPY pyproject.toml ./
# Keep dependencies cached when only application code changes. pyproject.toml
# remains the single dependency list, including the PostgreSQL driver.
RUN python -c 'import subprocess, tomllib; p = tomllib.load(open("pyproject.toml", "rb"))["project"]; subprocess.check_call(["pip", "install", *p["dependencies"]])'
COPY app ./app
RUN pip install --no-deps . && useradd --uid 10001 --create-home radar
COPY alembic.ini ./
COPY migrations ./migrations
USER radar
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--no-access-log", "--proxy-headers", "--forwarded-allow-ips", "172.29.10.2"]
