create table if not exists public.agent_subscriptions (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null,
  plan text not null,
  price integer not null,
  lead_limit integer,
  leads_used integer not null default 0,
  status text not null default 'active',
  start_date timestamptz not null default now(),
  end_date timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_agent_subscriptions_agent_id on public.agent_subscriptions(agent_id);
create index if not exists idx_agent_subscriptions_status_end_date on public.agent_subscriptions(status, end_date);
