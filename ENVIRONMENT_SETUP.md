# Environment Setup Guide

## Local Development

1. **Copy the example environment file:**
   ```bash
   cp .env.example .env
   ```

2. **Update `.env` with your Supabase credentials:**
   - Go to your Supabase project: https://supabase.com/dashboard
   - Navigate to Project Settings → API
   - Copy your Project URL and anon/public key
   - Update the `.env` file with these values

3. **Run the application:**
   ```bash
   go build && ./scuffedsnap
   ```
   
   The server will start on `http://localhost:8080` (or the port specified in `.env`)

## Vercel Deployment

When deploying to Vercel, you need to set environment variables in the Vercel dashboard:

1. Go to your Vercel project settings
2. Navigate to Settings → Environment Variables
3. Add the following variables:
   - `SUPABASE_URL`: Your Supabase project URL
   - `SUPABASE_ANON_KEY`: Your Supabase anon/public key

4. Redeploy your application for changes to take effect

## Security Notes

- ⚠️ **Never commit `.env` to version control** - it's already in `.gitignore`
- ✅ The `.env.example` file is safe to commit and should be kept up to date
- ✅ Only the Supabase anon/public key is exposed to the frontend (this is safe and intended)
- ✅ Never expose your Supabase service_role key to the frontend

## Configuration Values

### SUPABASE_URL
Your Supabase project URL in the format:
`https://your-project-id.supabase.co`

### SUPABASE_ANON_KEY
The anonymous/public API key for your Supabase project. This key is safe to use in client-side code as it only provides access based on your Row Level Security (RLS) policies.

### PORT (optional)
The port your local server will run on. Defaults to `8080` if not specified.
