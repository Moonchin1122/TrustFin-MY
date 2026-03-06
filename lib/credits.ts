import { supabase } from '@/lib/supabase';

export interface AgentCreditInfo {
  referral_code: string | null;
  referred_by_agent_id: string | null;
  credit_balance: number;
  credit_earned_total: number;
  credit_spent_total: number;
}

export interface CreditLedgerEntry {
  id: string;
  agent_id: string;
  entry_type: 'earn' | 'spend' | 'adjust';
  amount: number;
  reason: string;
  ref_agent_id: string | null;
  note: string | null;
  created_at: string;
}

export interface LeaderboardEntry {
  agent_id: string;
  agent_name: string;
  credits_earned: number;
  rank: number;
}

export async function fetchAgentCreditInfo(agentId: string): Promise<AgentCreditInfo> {
  console.log('[CREDITS] Fetching credit info for agent:', agentId);
  const { data, error } = await supabase
    .from('agents')
    .select('referral_code, referred_by_agent_id, credit_balance, credit_earned_total, credit_spent_total')
    .eq('id', agentId)
    .single();

  if (error) {
    console.log('[CREDITS] Error fetching credit info:', error.message);
    throw new Error(error.message);
  }

  return {
    referral_code: data?.referral_code ?? null,
    referred_by_agent_id: data?.referred_by_agent_id ?? null,
    credit_balance: Number(data?.credit_balance ?? 0),
    credit_earned_total: Number(data?.credit_earned_total ?? 0),
    credit_spent_total: Number(data?.credit_spent_total ?? 0),
  };
}

export async function fetchCreditLedger(agentId: string, limit = 50): Promise<CreditLedgerEntry[]> {
  console.log('[CREDITS] Fetching ledger for agent:', agentId);
  const { data, error } = await supabase
    .from('credit_ledger')
    .select('*')
    .eq('agent_id', agentId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.log('[CREDITS] Error fetching ledger:', error.message);
    throw new Error(error.message);
  }

  return (data ?? []) as CreditLedgerEntry[];
}

export async function fetchReferralCount(agentId: string): Promise<number> {
  console.log('[CREDITS] Fetching referral count for agent:', agentId);
  const { count, error } = await supabase
    .from('agents')
    .select('id', { count: 'exact', head: true })
    .eq('referred_by_agent_id', agentId);

  if (error) {
    console.log('[CREDITS] Error fetching referral count:', error.message);
    return 0;
  }

  return count ?? 0;
}

export async function fetchLeaderboard(limit = 20): Promise<LeaderboardEntry[]> {
  console.log('[CREDITS] Fetching leaderboard, limit:', limit);
  const { data, error } = await supabase.rpc('get_agent_leaderboard', {
    p_limit: limit,
    p_range_days: null,
  });

  if (error) {
    console.log('[CREDITS] Leaderboard RPC error:', error.message);
    const { data: fallback, error: fbErr } = await supabase
      .from('agents')
      .select('id, full_name, name, credit_earned_total')
      .gt('credit_earned_total', 0)
      .order('credit_earned_total', { ascending: false })
      .limit(limit);

    if (fbErr) {
      console.log('[CREDITS] Leaderboard fallback error:', fbErr.message);
      return [];
    }

    return (fallback ?? []).map((row: Record<string, unknown>, idx: number) => ({
      agent_id: row.id as string,
      agent_name: (row.full_name as string) || (row.name as string) || 'Agent',
      credits_earned: Number(row.credit_earned_total ?? 0),
      rank: idx + 1,
    }));
  }

  return (data ?? []).map((row: Record<string, unknown>) => ({
    agent_id: row.agent_id as string,
    agent_name: (row.agent_name as string) || 'Agent',
    credits_earned: Number(row.credits_earned ?? 0),
    rank: Number(row.rank ?? 0),
  }));
}

export async function validateAndApplyReferralCode(
  myAgentId: string,
  referralCode: string
): Promise<{ success: boolean; error?: string; referrerName?: string }> {
  console.log('[CREDITS] Validating referral code:', referralCode, 'for agent:', myAgentId);

  const { data: myAgent, error: myErr } = await supabase
    .from('agents')
    .select('referred_by_agent_id')
    .eq('id', myAgentId)
    .single();

  if (myErr) {
    console.log('[CREDITS] Error checking my agent:', myErr.message);
    return { success: false, error: myErr.message };
  }

  if (myAgent?.referred_by_agent_id) {
    return { success: false, error: 'You have already entered a referral code.' };
  }

  const code = referralCode.trim().toUpperCase();
  const { data: referrer, error: refErr } = await supabase
    .from('agents')
    .select('id, full_name, name')
    .eq('referral_code', code)
    .single();

  if (refErr || !referrer) {
    console.log('[CREDITS] Referral code not found:', code, refErr?.message);
    return { success: false, error: 'Invalid referral code. Please check and try again.' };
  }

  if (referrer.id === myAgentId) {
    return { success: false, error: 'You cannot use your own referral code.' };
  }

  const { error: updateErr } = await supabase
    .from('agents')
    .update({ referred_by_agent_id: referrer.id })
    .eq('id', myAgentId);

  if (updateErr) {
    console.log('[CREDITS] Error setting referred_by:', updateErr.message);
    return { success: false, error: updateErr.message };
  }

  const referrerName = referrer.full_name || referrer.name || 'Agent';
  console.log('[CREDITS] Referral code applied. Referrer:', referrerName);
  return { success: true, referrerName };
}

export async function generateReferralCodeIfMissing(agentId: string): Promise<string | null> {
  const { data } = await supabase
    .from('agents')
    .select('referral_code')
    .eq('id', agentId)
    .single();

  if (data?.referral_code) return data.referral_code;

  const code = agentId.replace(/-/g, '').substring(0, 8).toUpperCase();
  const { error } = await supabase
    .from('agents')
    .update({ referral_code: code })
    .eq('id', agentId);

  if (error) {
    console.log('[CREDITS] Error generating referral code:', error.message);
    return null;
  }

  return code;
}

export async function addAgentCredits(
  agentId: string,
  amount: number,
  reason: string,
  refAgentId?: string,
  note?: string
): Promise<{ success: boolean; error?: string }> {
  console.log('[CREDITS] Adding credits:', amount, 'to agent:', agentId, 'reason:', reason);
  const { error } = await supabase.rpc('add_agent_credits', {
    p_agent_id: agentId,
    p_amount: amount,
    p_reason: reason,
    p_ref_agent_id: refAgentId ?? null,
    p_note: note ?? null,
  });

  if (error) {
    console.log('[CREDITS] add_agent_credits RPC error:', error.message);
    const { error: insertErr } = await supabase.from('credit_ledger').insert({
      agent_id: agentId,
      entry_type: 'earn',
      amount,
      reason,
      ref_agent_id: refAgentId ?? null,
      note: note ?? null,
    });
    if (insertErr) {
      console.log('[CREDITS] Fallback insert error:', insertErr.message);
      return { success: false, error: insertErr.message };
    }
    const { data: agent } = await supabase
      .from('agents')
      .select('credit_balance, credit_earned_total')
      .eq('id', agentId)
      .single();

    if (agent) {
      await supabase
        .from('agents')
        .update({
          credit_balance: Number(agent.credit_balance ?? 0) + amount,
          credit_earned_total: Number(agent.credit_earned_total ?? 0) + amount,
        })
        .eq('id', agentId);
    }
  }

  return { success: true };
}

export async function spendAgentCredits(
  agentId: string,
  amount: number,
  reason: string,
  note?: string
): Promise<{ success: boolean; error?: string }> {
  console.log('[CREDITS] Spending credits:', amount, 'from agent:', agentId, 'reason:', reason);
  const { error } = await supabase.rpc('spend_agent_credits', {
    p_agent_id: agentId,
    p_amount: amount,
    p_reason: reason,
    p_note: note ?? null,
  });

  if (error) {
    console.log('[CREDITS] spend_agent_credits RPC error:', error.message);
    if (error.message.includes('Insufficient')) {
      return { success: false, error: 'Insufficient credits.' };
    }

    const { data: agent } = await supabase
      .from('agents')
      .select('credit_balance, credit_spent_total')
      .eq('id', agentId)
      .single();

    if (!agent || Number(agent.credit_balance ?? 0) < amount) {
      return { success: false, error: 'Insufficient credits.' };
    }

    const { error: insertErr } = await supabase.from('credit_ledger').insert({
      agent_id: agentId,
      entry_type: 'spend',
      amount,
      reason,
      note: note ?? null,
    });
    if (insertErr) {
      return { success: false, error: insertErr.message };
    }

    await supabase
      .from('agents')
      .update({
        credit_balance: Number(agent.credit_balance) - amount,
        credit_spent_total: Number(agent.credit_spent_total ?? 0) + amount,
      })
      .eq('id', agentId);
  }

  return { success: true };
}
