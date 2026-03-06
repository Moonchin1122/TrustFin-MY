create table if not exists public.consultations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  agent_id uuid not null,
  full_name text,
  phone text,
  loan_type text not null,
  state text not null,
  district text not null,
  message text not null,
  status text not null default 'new',
  created_at timestamptz not null default now()
);

alter table public.consultations add column if not exists borrower_name text;
alter table public.consultations add column if not exists borrower_phone text;
alter table public.consultations add column if not exists borrower_email text;
alter table public.consultations add column if not exists loan_amount numeric;
alter table public.consultations add column if not exists monthly_income numeric;
alter table public.consultations add column if not exists work_type text;
alter table public.consultations add column if not exists urgency text;

update public.consultations
set borrower_name = coalesce(nullif(trim(borrower_name), ''), nullif(trim(full_name), ''))
where borrower_name is null or trim(borrower_name) = '';

update public.consultations
set borrower_phone = coalesce(nullif(trim(borrower_phone), ''), nullif(trim(phone), ''))
where borrower_phone is null or trim(borrower_phone) = '';

create index if not exists idx_consultations_agent_id_created_at on public.consultations(agent_id, created_at desc);
create index if not exists idx_consultations_user_id_created_at on public.consultations(user_id, created_at desc);

drop function if exists public.create_consultation(uuid, text, text, text, text, text, text, text, numeric);
drop function if exists public.create_consultation(uuid, text, text, text, text, text, text, text, numeric, numeric, text, text);

drop function if exists public.create_consultation_v2(uuid, text, text, text, text, numeric, numeric, text, text);

create function public.create_consultation(
  agent_id uuid,
  district text,
  loan_type text,
  message text,
  state text,
  borrower_name text,
  borrower_phone text,
  borrower_email text,
  loan_amount numeric,
  monthly_income numeric default null,
  work_type text default null,
  urgency text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $
declare
  active_subscription public.agent_subscriptions%rowtype;
  requester_id uuid;
  requester_name text;
  requester_phone text;
  requester_email text;
  consultation_id uuid;
begin
  requester_id := auth.uid();

  if requester_id is null then
    raise exception 'authentication_required';
  end if;

  select *
  into active_subscription
  from public.agent_subscriptions s
  where s.agent_id = create_consultation.agent_id
    and s.status = 'active'
    and s.start_date <= now()
    and s.end_date > now()
  order by s.end_date desc, s.created_at desc
  limit 1;

  if active_subscription.id is null then
    raise exception 'agent_lead_quota_exceeded';
  end if;

  if active_subscription.lead_limit is not null and coalesce(active_subscription.leads_used, 0) >= active_subscription.lead_limit then
    raise exception 'agent_lead_quota_exceeded';
  end if;

  select
    coalesce(nullif(trim(create_consultation.borrower_name), ''), nullif(trim(u.name), ''), 'Borrower'),
    coalesce(nullif(trim(create_consultation.borrower_phone), ''), nullif(trim(u.phone), ''), ''),
    coalesce(nullif(trim(create_consultation.borrower_email), ''), nullif(trim(u.email), ''), '')
  into requester_name, requester_phone, requester_email
  from public.users u
  where u.id = requester_id
  limit 1;

  insert into public.consultations (
    user_id,
    agent_id,
    full_name,
    phone,
    borrower_name,
    borrower_phone,
    borrower_email,
    loan_type,
    state,
    district,
    message,
    loan_amount,
    monthly_income,
    work_type,
    urgency
  )
  values (
    requester_id,
    create_consultation.agent_id,
    requester_name,
    requester_phone,
    requester_name,
    requester_phone,
    requester_email,
    nullif(trim(create_consultation.loan_type), ''),
    nullif(trim(create_consultation.state), ''),
    nullif(trim(create_consultation.district), ''),
    nullif(trim(create_consultation.message), ''),
    create_consultation.loan_amount,
    create_consultation.monthly_income,
    nullif(trim(create_consultation.work_type), ''),
    nullif(trim(create_consultation.urgency), '')
  )
  returning id into consultation_id;

  update public.agent_subscriptions
  set leads_used = coalesce(leads_used, 0) + 1
  where id = active_subscription.id;

  return consultation_id;
end;
$$;

revoke all on function public.create_consultation(uuid, text, text, text, text, text, text, text, numeric, numeric, text, text) from public;
grant execute on function public.create_consultation(uuid, text, text, text, text, text, text, text, numeric, numeric, text, text) to authenticated;

drop view if exists public.agents_available;

create view public.agents_available as
select ap.*
from public.agents_public ap
join lateral (
  select s.id, s.lead_limit, s.leads_used, s.end_date, s.start_date
  from public.agent_subscriptions s
  where s.agent_id = coalesce(ap.agent_id, ap.id)
    and s.status = 'active'
    and s.start_date <= now()
    and s.end_date > now()
  order by s.end_date desc, s.created_at desc
  limit 1
) active_subscription on true
where coalesce(ap.verified, false) = true
  and (
    active_subscription.lead_limit is null
    or coalesce(active_subscription.leads_used, 0) < active_subscription.lead_limit
  );
