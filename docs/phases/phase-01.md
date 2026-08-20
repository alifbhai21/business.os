# Phase 01 — Foundation & Project Setup

## Objective
Establish the foundational project structure, fix broken existing code, and set up both the backend server and mobile app so they compile and run.

## Why This Phase Exists
The current `mobile/` app had missing critical files (`api.ts`, `theme.ts`, `dictionaries.ts`) that prevented it from compiling. The current `server/` had an empty `src/` directory. Nothing worked until this phase.

## Dependencies
- None

## Existing Implementation Status
- `mobile/App.tsx` — existed, referenced missing modules → **FIXED**
- `mobile/screens/*` — existed, referenced missing modules → **FIXED**
- `mobile/src/auth.tsx` — existed, imported missing `./api` → **FIXED**
- `server/package.json` — existed with dependencies → **EXTENDED**
- `server/src/` — empty directories only → **BUILT**

## Tasks

### Database

- [x] Create MongoDB connection module (`server/src/db/connect.ts`) — with in-memory fallback
- [x] Add Mongoose models directory structure (`server/src/models/` ready for Phase 02+)
- [x] Add environment configuration (Zod-validated `.env`) (`server/src/config/env.ts`)
- [x] Add health check endpoint (`GET /health`)
- [x] Add ready check endpoint (`GET /ready`)

### Backend

- [x] Set up Express + TypeScript project
- [x] Add tsconfig strict mode (`"strict": true`, types: node)
- [x] Add package.json scripts (dev, build, start, typecheck, test)
- [x] Add `server/src/index.ts` entry point
- [x] Add `server/src/app.ts` Express app
- [x] Add middleware stack: helmet, CORS, body limit, mongo-sanitize, rate limit
- [x] Add error handler middleware
- [x] Add asyncHandler utility (`server/src/utils/asyncHandler.ts`)
- [x] Add ApiError class (`server/src/utils/ApiError.ts`)
- [x] Add response envelope utilities (`server/src/utils/response.ts`)
- [x] Add Winston logging (`server/src/utils/logger.ts`)
- [x] Add 404 handler

### Mobile Frontend

- [x] Fix missing `src/api.ts` — API client with token attach, base URL, error handling
- [x] Fix missing `src/theme.ts` — colors, typography, typeLabels, moduleLabels, businessTypes
- [x] Fix missing `src/i18n/dictionaries.ts` — bn/en dictionaries
- [x] Verify navigation (state-based kept)
- [x] Verify app icon and splash screen config (present in `app.json`)
- [x] Verify Android configuration (present in `app.json`)
- [ ] Add expo-secure-store for token storage (Phase 02)

### Security

- [x] Add CORS allowlist config
- [x] Add express-rate-limit config (global + health/ready excluded)
- [x] Add express-mongo-sanitize
- [x] Add helmet
- [x] Add `express.json({ limit: '10kb' })`

### Testing

- [x] Set up test framework (node:test + supertest)
- [x] Add test config for TypeScript (`tsx --test`)
- [x] Add mongodb-memory-server test setup (`server/test/setup.ts`)
- [x] Add first smoke test (health/ready/404) (`server/test/health.test.ts`)

### Documentation

- [x] Update README with setup instructions
- [x] Add `.env.example`
- [x] Add `.gitignore`
- [x] Resolve duplicate `business-os/` directory (git-excluded, preserved on disk; root is canonical)

## Acceptance Criteria

- [x] Server starts with `npm run dev` (verified — boots with in-memory MongoDB)
- [x] `GET /health` returns 200 (verified — `{"success":true,"status":"ok"}`)
- [x] `GET /ready` returns 200 when connected / 503 when not (verified via boot + test)
- [x] Mobile app compiles without errors (`node node_modules/typescript/bin/tsc --noEmit` — 0 errors)
- [x] Typecheck passes (`npm run typecheck` — 0 errors)
- [x] Tests pass (`npm test` — 3/3 pass)
- [x] No missing imports anywhere

## Testing
Run: `cd server && npm run typecheck && npm test`

**Verified output:**
```
TS typecheck: pass (0 errors)
Tests: 3 pass, 0 fail
GET /health → 200 ok
GET /ready → 200 ready (db connected) / 503 not_ready (disconnected)
GET /unknown → 404 NOT_FOUND
Mobile tsc --noEmit → pass (0 errors)
```

## Expected Output (achieved)
- `server/` — Express server that starts, auto-connects to in-memory MongoDB (or supplied `DATABASE_URL`), serves `/health` and `/ready`
- `mobile/` — Expo app that compiles cleanly and shows the Welcome screen

## Status
- [x] **COMPLETE — Phase 01 verified**