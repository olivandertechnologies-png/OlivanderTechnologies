alter table public.clients
add column if not exists summary text;

alter table public.clients
add column if not exists summary_generated_at timestamptz;
