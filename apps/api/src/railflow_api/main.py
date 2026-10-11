from fastapi import FastAPI
from railflow import __version__

app = FastAPI(title="RailFlow API")


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok", "version": __version__}
