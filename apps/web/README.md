# RailFlow web

Simulation player, Gantt chart and disruption panel for RailFlow (VORTEXA 3.0, P-03).

## Run

    npm install
    npm run dev

Open http://localhost:5173. It uses a built-in mock replanner by default.

To use the real backend, create `.env` with:

    VITE_USE_MOCK=false
    VITE_API_BASE=/api

and proxy `/api` to the FastAPI server in `vite.config.js`.