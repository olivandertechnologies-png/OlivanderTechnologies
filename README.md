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

Backend `backend/.env` values should include:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_KEY`
- `GEMINI_API_KEY`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `DIGEST_CRON_SECRET`

## Weekly Digest

- The weekly digest is sent by `POST /digest/send`.
- Manual sends use the signed-in user's bearer token.
- Batch sends for all `weekly_digest_enabled` users use the `X-Olivander-Cron-Secret` header with the value from `DIGEST_CRON_SECRET`.
- Schedule the batch trigger for every Monday at 8:00am in `Pacific/Auckland`.

Example Railway cron request:

```sh
curl -X POST "$API_BASE_URL/digest/send" \
  -H "X-Olivander-Cron-Secret: $DIGEST_CRON_SECRET"
```

- After deploying the new Google scopes, existing users should sign in with Google again so Olivander can store a Gmail refresh token for digest delivery.

## Security Notes

- Keep Gemini and Supabase service-role keys in `backend/.env` only.
- Only the public Supabase anon key should appear in frontend `VITE_` variables.
- If any secret was ever committed or exposed client-side, rotate it before deploying.
