alter table public.consultations add column if not exists loan_amount numeric;
alter table public.consultations add column if not exists monthly_income numeric;
alter table public.consultations add column if not exists work_type text;
alter table public.consultations add column if not exists urgency text;
