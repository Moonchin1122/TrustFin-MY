import { supabase } from '@/lib/supabase';
import type { UserProfile } from '@/contexts/AuthContext';

type AgentIdRow = {
  id: string;
};

function isMissingColumnError(message?: string | null): boolean {
  const text = (message ?? '').toLowerCase();
  return text.includes('column') && text.includes('does not exist');
}

export async function resolveAgentProfileId(user: UserProfile): Promise<string> {
  if (!user.id) {
    throw new Error('Agent account is required.');
  }

  const byId = await supabase.from('agents').select('id').eq('id', user.id).maybeSingle();
  if (byId.data?.id) {
    return (byId.data as AgentIdRow).id;
  }

  const byUserId = await supabase.from('agents').select('id').eq('user_id', user.id).maybeSingle();
  if (byUserId.data?.id) {
    return (byUserId.data as AgentIdRow).id;
  }

  if (byUserId.error && !isMissingColumnError(byUserId.error.message)) {
    console.log('[AGENT_PROFILE] Failed querying agents by user_id:', byUserId.error);
  }

  const fallbackName = user.name?.trim() || 'Agent';

  const candidatePayloads: Record<string, string | number | boolean | null>[] = [
    {
      id: user.id,
      user_id: user.id,
      full_name: fallbackName,
      phone: user.phone || null,
      state: user.state || null,
      rating: user.rating ?? 0,
      is_verified: user.isVerified ?? false,
    },
    {
      id: user.id,
      full_name: fallbackName,
      phone: user.phone || null,
      state: user.state || null,
      rating: user.rating ?? 0,
      is_verified: user.isVerified ?? false,
    },
    {
      id: user.id,
    },
  ];

  for (const payload of candidatePayloads) {
    const createRes = await supabase.from('agents').insert(payload).select('id').single();
    if (createRes.data?.id) {
      return (createRes.data as AgentIdRow).id;
    }

    if (createRes.error) {
      console.log('[AGENT_PROFILE] Failed creating agent profile payload:', payload, createRes.error.message);
    }
  }

  const retryById = await supabase.from('agents').select('id').eq('id', user.id).maybeSingle();
  if (retryById.data?.id) {
    return (retryById.data as AgentIdRow).id;
  }

  throw new Error('Agent profile record is missing. Please complete agent registration first.');
}
