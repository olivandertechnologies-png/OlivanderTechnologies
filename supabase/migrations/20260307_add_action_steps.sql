alter table public.actions
add column if not exists steps text[];

update public.actions
set steps = '{}'::text[]
where steps is null;

alter table public.actions
alter column steps set default '{}'::text[];

alter table public.actions
alter column steps set not null;
