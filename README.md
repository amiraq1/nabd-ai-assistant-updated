# Nabd AI Assistant

`Nabd AI Assistant` is an Arabic-first chat assistant built with React + Express and PostgreSQL.  
It currently supports conversational memory and model responses through NVIDIA-hosted LLMs.

## Tech Stack

- Frontend: React, Vite, Tailwind, Radix UI
- Backend: Node.js, Express
- Database: PostgreSQL + Drizzle ORM
- LLM Provider: NVIDIA API (`meta/llama-3.1-70b-instruct` by default)

## Current Architecture

- `server/routes.ts`: HTTP API routes for conversations and messages.
- `server/storage.ts`: DB access layer.
- `server/ai/provider.ts`: model provider integration.
- `server/ai/orchestrator.ts`: assistant orchestration layer.
- `server/ai/prompt-profiles.ts`: server-managed system prompt profiles.
- `server/ai/tools.ts`: tools facade over dynamic skills (planning + execution contracts).
- `server/ai/planner.ts`: simple planner for multi-step requests.
- `server/rag/*`: local vector-store retrieval pipeline.
- `server/skills/*`: dynamic skill discovery and execution handlers.
- `skills/*/skill.json`: executable skill manifests loaded at runtime.
- `skills/*/SKILL.md`: Agent Skills compatible instruction skills (YAML frontmatter + Markdown).

## Implemented Agent Foundation (Phase 1)

The project now includes a practical agent architecture baseline:

- Unified Tool Schema and execution registry.
- Skills (dynamic):
  - `date_time`: current date/time.
  - `weather`: live weather via Open-Meteo.
  - `web_search`: live web lookup (Wikipedia search API).
  - `exchange_rate`: currency conversion (Exchangerate.host with fallback provider).
  - `world_time`: world timezone lookup.
  - `ip_geolocation`: geolocation/timezone by IP (IPstack with fallback provider).
  - `news_headlines`: topic headlines via NewsAPI.
  - `rest_countries`: country profile data.
  - `hijri_calendar`: Arabic/Hijri calendar conversion.
- Agent Skills compatibility:
  - Discovery supports standard `SKILL.md` files (as defined by `agentskills/agentskills`).
  - Instruction-only skills are injected through an `<available_skills>` XML block in system context.
  - Executable `skill.json` skills remain available as tool/function-calling actions.
- `Planner Agent` (heuristic): splits multi-intent requests into executable tool steps + synthesis.
- `RAG` retrieval stage: vector retrieval with persisted local document store (`data/rag-documents.json` by default).
- `Orchestration Layer`: composes plan + skills + RAG context and supports model function-calling with safe fallback.
- Context management: automatic conversation summarization for long threads before model generation.
- Prompt governance: profile-based system prompts selected by `systemPromptId` instead of raw client prompt text.
- Debug/observability endpoints for tracing plans, tool runs, and RAG context in development.

## Environment Variables

Set the following variables before running:

- `DATABASE_URL`: PostgreSQL connection string.
- `NVIDIA_API_KEY`: API key for NVIDIA model inference.
- `AI_ENDPOINT` (optional): override model endpoint.
- `AI_MODEL` (optional): override default model.
- `AI_REQUEST_TIMEOUT_MS` (optional): timeout for model requests (default 30000 ms).
- `NEWS_API_KEY` (optional): required for the `news_headlines` skill.
- `IPSTACK_API_KEY` (optional): enables IPstack provider for `ip_geolocation`.
- `NABD_SKILLS_DIR` (optional): override skills directory path (default `skills`).
- `RAG_STORE_PATH` (optional): override persisted RAG store file path.
- `DEBUG_API_TOKEN` (required if debug endpoints are enabled): token for debug endpoint auth.
- `ENABLE_AI_DEBUG_ENDPOINTS` (optional): set `true` to enable debug endpoints in production.
- `VITE_PHONE_API_BASE` (optional): when set, the frontend sends prompts directly from the browser to your phone's `/api/generate` endpoint instead of Nabd's conversation API.
- `VITE_PHONE_MODEL` (optional): model name sent to the phone endpoint (default `tinyllama`).
- `ENABLE_PHONE_PROXY` (optional): allows the phone proxy route in production. Development always allows it.
- `PHONE_PROXY_TIMEOUT_MS` (optional): timeout for proxied phone requests (default `120000`).

## Development

```bash
npm install
npm run db:push
npm run lint
npm run test
npm run check
npm run dev
```

### Direct Phone Mode

If your phone exposes an Ollama-compatible `POST /api/generate` endpoint, you can point the frontend at it directly:

```bash
VITE_PHONE_API_BASE=http://192.168.1.50:11434
VITE_PHONE_MODEL=tinyllama
```

Notes:

- You can set `VITE_PHONE_API_BASE` to either the base URL or the full `/api/generate` URL.
- You can also set the phone endpoint at runtime with `?phoneApiBase=https://...&phoneModel=tinyllama`; the app stores it in `localStorage`.
- Requests go through Nabd's local `/api/direct-phone/generate` proxy, so browser CORS on the phone endpoint is no longer required.
- Direct phone mode now wraps prompts with stricter anti-hallucination instructions and marks lower-confidence factual answers with an accuracy warning in the UI.
- In direct mode, chat history stays in the browser and does not use Nabd conversations or the database.

## Data Isolation

- Conversations are isolated per browser session using an HttpOnly cookie (`nabd_uid`).
- API routes now enforce conversation ownership checks before listing, reading, deleting, or adding messages.

## Vercel Deployment (Frontend + API)

This repository builds two outputs:

- `dist/public`: Vite frontend files (what Vercel should serve).
- `dist/index.cjs`: Node server bundle for non-Vercel Node hosting.

To avoid serving the Node bundle as the website root, Vercel is configured via `vercel.json` to:

- run `npm run build`
- publish `dist/public`
- route `/api/*` to a Vercel Node function (`api/index.ts`) that reuses the Express routes.
- fallback non-file frontend paths to `index.html` for SPA routing.

After pulling these changes, redeploy the project in Vercel.  
If you have Build & Output overrides set in the Vercel dashboard, disable them so `vercel.json` is respected.

### Debug Endpoints (development only)

- `POST /api/ai/debug/plan` with `{ "content": "..." }`
- `GET /api/ai/debug/trace/latest?conversationId=<id>`
- `GET /api/ai/debug/trace/history?conversationId=<id>&limit=10`
- `GET /api/ai/debug/rag/documents`
- `POST /api/ai/debug/rag/documents` with `{ "documents": [...] }`
- `GET /api/ai/debug/skills`
- `POST /api/ai/debug/skills/reload`
- `GET /api/ai/debug/skills/prompt` (returns `<available_skills>` XML)

Runtime endpoints:

- `GET /api/ai/prompt-profiles`
- `GET /api/skills`

Auth for debug endpoints:

- Use `Authorization: Bearer <DEBUG_API_TOKEN>` or header `x-debug-token: <DEBUG_API_TOKEN>`.
- Debug endpoints are disabled unless `DEBUG_API_TOKEN` is configured.
- In production, debug endpoints also require `ENABLE_AI_DEBUG_ENDPOINTS=true`.

## Roadmap (Short Version)

- Phase 1: Tool use + orchestration foundation (done).
- Phase 2: RAG persistence + indexing improvements (in progress).
- Phase 3: advanced multi-agent workflows (next).

Detailed implementation tasks are tracked in:

- `tasks/todo.md`
- `tasks/lessons.md`
