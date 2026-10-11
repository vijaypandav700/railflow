FROM python:3.13-slim AS base
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy UV_PYTHON_DOWNLOADS=never \
    UV_PROJECT_ENVIRONMENT=/opt/venv PATH="/opt/venv/bin:$PATH"
WORKDIR /app
COPY pyproject.toml uv.lock .python-version ./
COPY packages/engine packages/engine
COPY apps/api apps/api

FROM base AS test
RUN uv sync --frozen
CMD ["pytest", "packages", "apps"]

FROM base AS runtime
RUN uv sync --frozen --no-dev
RUN useradd -m app && mkdir /data && chown app /data
USER app
CMD ["uvicorn", "railflow_api.main:app", "--host", "0.0.0.0", "--port", "8000"]
