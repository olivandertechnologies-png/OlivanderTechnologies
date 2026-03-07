alter table public.actions
add column if not exists confidence text;

alter table public.actions
add column if not exists confidence_reason text;
