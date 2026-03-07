alter table public.users
  add column if not exists onboarding_complete boolean,
  add column if not exists client_type text,
  add column if not exists client_count text,
  add column if not exists client_source text,
  add column if not exists email_never_say text,
  add column if not exists followup_invoice_delay text;

update public.users
set onboarding_complete = false
where onboarding_complete is null;

alter table public.users
  alter column onboarding_complete set default false;

alter table public.users
  alter column onboarding_complete set not null;
