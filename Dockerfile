# Single-image build for Render: FastAPI serves the API and the built web app.
FROM node:24-alpine AS web
RUN npm install -g pnpm@12.6.0
WORKDIR /app
COPY pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/web/package.json apps/web/package.json
COPY packages/validator-ts/package.json packages/validator-ts/package.json
RUN pnpm install --frozen-lockfile
COPY apps/web apps/web
COPY packages/validator-ts packages/validator-ts
RUN pnpm --dir apps/web build

FROM python:3.13-slim
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy UV_PYTHON_DOWNLOADS=never \
    UV_PROJECT_ENVIRONMENT=/opt/venv PATH="/opt/venv/bin:$PATH" \
    RAILFLOW_WEB_DIR=/app/web-dist
WORKDIR /app
COPY pyproject.toml uv.lock .python-version ./
COPY packages/engine packages/engine
COPY apps/api apps/api
COPY contracts contracts
COPY scenarios scenarios
RUN uv sync --frozen --no-dev
COPY --from=web /app/apps/web/dist /app/web-dist
RUN useradd -m app && mkdir /data && chown app /data
USER app
CMD ["sh", "-c", "uvicorn railflow_api.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
