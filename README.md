# ScuffedSnap

Simple Supabase-backed chat app with a Go server that serves static pages and exposes config to the client. Includes Vercel-compatible serverless entry (`api/index.go`).

## Features
- Go 1.24 HTTP server serving `/`, `/app`, `/admin`, and static assets under `/static/`
- `/api/config` returns `SUPABASE_URL` and `SUPABASE_ANON_KEY` for the frontend
- Frontend lives in `static/` with basic auth, messaging, and admin pages
- SQL helpers for provisioning Supabase tables, storage, and admin flags

## Prerequisites
- Go 1.24+
- Supabase project (URL + anon key)

## Local Setup
1. Install deps: `go mod download`
2. Create a `.env` file with:
   ```env
   SUPABASE_URL=your-supabase-url
   SUPABASE_ANON_KEY=your-supabase-anon-key
   PORT=8080
   ```
3. Run the server: `go run main.go`
4. Visit `http://localhost:8080` (use `/app` for the app, `/admin` for the admin page).

## Vercel Deploy
- Vercel uses `api/index.go` as the entrypoint; ensure env vars `SUPABASE_URL` and `SUPABASE_ANON_KEY` are set in the project.

## Database & Storage
- SQL setup scripts live in the repo (e.g., `complete_database_setup.sql`, `setup_profile_features.sql`, `create_avatar_storage.sql`, `grant_admin.sql`). Apply them in Supabase SQL editor as needed for auth, profiles, messaging, avatars, and admin roles.
