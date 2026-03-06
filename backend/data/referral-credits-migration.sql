-- =============================================
-- TrustFin: Referral Credits Migration
-- Safe: uses IF NOT EXISTS / ADD COLUMN IF NOT EXISTS
-- =============================================

-- 1) Extend public.agents with referral & credit columns
ALTER TABLE public.agents ADD COLUMN IF NOT EXISTS referral_code TEXT UNIQUE;
ALTER TABLE public.agents ADD COLUMN IF NOT EXISTS referred_by_agent_id UUID REFERENCES public.agents(id);
ALTER TABLE public.agents ADD COLUMN IF NOT EXISTS credit_balance NUMERIC DEFAULT 0;
ALTER TABLE public.agents ADD COLUMN IF NOT EXISTS credit_earned_total NUMERIC DEFAULT 0;
ALTER TABLE public.agents ADD COLUMN IF NOT EXISTS credit_spent_total NUMERIC DEFAULT 0;
ALTER TABLE public.agents ADD COLUMN IF NOT EXISTS reject_reason TEXT;
ALTER TABLE public.agents ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending';

-- Generate referral codes for existing agents that don't have one
UPDATE public.agents
SET referral_code = UPPER(SUBSTR(MD5(id::text || NOW()::text), 1, 8))
WHERE referral_code IS NULL;

-- 2) Create credit_ledger table
CREATE TABLE IF NOT EXISTS public.credit_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES public.agents(id),
  entry_type TEXT NOT NULL CHECK (entry_type IN ('earn', 'spend', 'adjust')),
  amount NUMERIC NOT NULL CHECK (amount > 0),
  reason TEXT NOT NULL,
  ref_agent_id UUID REFERENCES public.agents(id),
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_credit_ledger_agent_id ON public.credit_ledger(agent_id);
CREATE INDEX IF NOT EXISTS idx_credit_ledger_created_at ON public.credit_ledger(created_at);

-- Partial unique index: prevent duplicate referral_kyc_bonus for same pair
CREATE UNIQUE INDEX IF NOT EXISTS idx_credit_ledger_referral_unique
  ON public.credit_ledger(agent_id, reason, ref_agent_id)
  WHERE reason = 'referral_kyc_bonus';

-- 3) RPC: add_agent_credits
CREATE OR REPLACE FUNCTION public.add_agent_credits(
  p_agent_id UUID,
  p_amount NUMERIC,
  p_reason TEXT,
  p_ref_agent_id UUID DEFAULT NULL,
  p_note TEXT DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_ledger_id UUID;
BEGIN
  INSERT INTO public.credit_ledger (agent_id, entry_type, amount, reason, ref_agent_id, note)
  VALUES (p_agent_id, 'earn', p_amount, p_reason, p_ref_agent_id, p_note)
  RETURNING id INTO v_ledger_id;

  UPDATE public.agents
  SET credit_balance = credit_balance + p_amount,
      credit_earned_total = credit_earned_total + p_amount
  WHERE id = p_agent_id;

  RETURN v_ledger_id;
END;
$$ LANGUAGE plpgsql;

-- 4) RPC: spend_agent_credits
CREATE OR REPLACE FUNCTION public.spend_agent_credits(
  p_agent_id UUID,
  p_amount NUMERIC,
  p_reason TEXT,
  p_note TEXT DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_balance NUMERIC;
  v_ledger_id UUID;
BEGIN
  SELECT credit_balance INTO v_balance FROM public.agents WHERE id = p_agent_id FOR UPDATE;

  IF v_balance IS NULL THEN
    RAISE EXCEPTION 'Agent not found: %', p_agent_id;
  END IF;

  IF v_balance < p_amount THEN
    RAISE EXCEPTION 'Insufficient credits. Balance: %, Requested: %', v_balance, p_amount;
  END IF;

  INSERT INTO public.credit_ledger (agent_id, entry_type, amount, reason, note)
  VALUES (p_agent_id, 'spend', p_amount, p_reason, p_note)
  RETURNING id INTO v_ledger_id;

  UPDATE public.agents
  SET credit_balance = credit_balance - p_amount,
      credit_spent_total = credit_spent_total + p_amount
  WHERE id = p_agent_id;

  RETURN v_ledger_id;
END;
$$ LANGUAGE plpgsql;

-- 5) RPC: get_agent_leaderboard
CREATE OR REPLACE FUNCTION public.get_agent_leaderboard(
  p_limit INT DEFAULT 20,
  p_range_days INT DEFAULT NULL
) RETURNS TABLE(
  agent_id UUID,
  agent_name TEXT,
  credits_earned NUMERIC,
  rank BIGINT
) AS $$
BEGIN
  IF p_range_days IS NOT NULL THEN
    RETURN QUERY
      SELECT
        a.id AS agent_id,
        COALESCE(a.full_name, a.name, 'Agent') AS agent_name,
        COALESCE(SUM(cl.amount), 0) AS credits_earned,
        ROW_NUMBER() OVER (ORDER BY COALESCE(SUM(cl.amount), 0) DESC) AS rank
      FROM public.agents a
      LEFT JOIN public.credit_ledger cl
        ON cl.agent_id = a.id
        AND cl.entry_type = 'earn'
        AND cl.created_at >= NOW() - (p_range_days || ' days')::INTERVAL
      GROUP BY a.id, a.full_name, a.name
      HAVING COALESCE(SUM(cl.amount), 0) > 0
      ORDER BY credits_earned DESC
      LIMIT p_limit;
  ELSE
    RETURN QUERY
      SELECT
        a.id AS agent_id,
        COALESCE(a.full_name, a.name, 'Agent') AS agent_name,
        a.credit_earned_total AS credits_earned,
        ROW_NUMBER() OVER (ORDER BY a.credit_earned_total DESC) AS rank
      FROM public.agents a
      WHERE a.credit_earned_total > 0
      ORDER BY a.credit_earned_total DESC
      LIMIT p_limit;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- 6) RPC: apply_credits_to_subscription
CREATE OR REPLACE FUNCTION public.apply_credits_to_subscription(
  p_agent_id UUID,
  p_plan_price NUMERIC
) RETURNS TABLE(credits_used NUMERIC, net_price NUMERIC) AS $$
DECLARE
  v_balance NUMERIC;
  v_credits_used NUMERIC;
BEGIN
  SELECT credit_balance INTO v_balance FROM public.agents WHERE id = p_agent_id;

  IF v_balance IS NULL THEN
    v_balance := 0;
  END IF;

  v_credits_used := LEAST(v_balance, p_plan_price);

  RETURN QUERY SELECT v_credits_used, p_plan_price - v_credits_used;
END;
$$ LANGUAGE plpgsql;

-- 7) Enable realtime for credit_ledger
ALTER PUBLICATION supabase_realtime ADD TABLE public.credit_ledger;
