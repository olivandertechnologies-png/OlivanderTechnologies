alter table public.users
add column if not exists weekly_digest_enabled boolean not null default true;

create table if not exists public.user_google_oauth_credentials (
  user_id uuid primary key references public.users(id) on delete cascade,
  provider_email text,
  refresh_token text not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.user_google_oauth_credentials enable row level security;
