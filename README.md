# Olivander

Olivander pairs a React frontend with a FastAPI backend to surface client follow-ups, draft actions, and manage approvals.

## Frontend

- Install dependencies with `npm install`
- Start development with `npm run dev`
- Build with `npm run build`
- Lint with `npm run lint`

## Backend

- Install Python packages with `pip install -r backend/requirements.txt`
- Run the API with `uvicorn backend.main:app --reload`

## Environment

Frontend `.env` values:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_API_URL`

Backend `backend/.env` values should include the Supabase service credentials and Gemini API key.

## Security Notes

- Keep Gemini and Supabase service-role keys in `backend/.env` only.
- Only the public Supabase anon key should appear in frontend `VITE_` variables.
- If any secret was ever committed or exposed client-side, rotate it before deploying.
