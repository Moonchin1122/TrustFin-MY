import { supabase } from '@/lib/supabase';

export type ConsultationPayload = {
  agentId: string;
  district: string;
  loanType: string;
  message: string;
  state: string;
  borrowerName: string;
  borrowerPhone: string;
  borrowerEmail: string;
  loanAmount: number;
  monthlyIncome?: number | null;
  workType?: string | null;
  urgency?: string | null;
};

export type ConsultationV2Payload = {
  agentId: string;
  district: string;
  loanType: string;
  message: string;
  state: string;
  amount: number;
  monthlyIncome?: number | null;
  employmentType?: string | null;
  urgency?: string | null;
};

export type ConsultationRpcErrorCode = 'agent_lead_quota_exceeded' | 'unknown';

export class ConsultationRpcError extends Error {
  code: ConsultationRpcErrorCode;

  constructor(message: string, code: ConsultationRpcErrorCode = 'unknown') {
    super(message);
    this.name = 'ConsultationRpcError';
    this.code = code;
  }
}

function getRpcErrorCode(error: { message?: string; details?: string | null; hint?: string | null; code?: string } | null | undefined): ConsultationRpcErrorCode {
  const raw = [error?.message, error?.details, error?.hint, error?.code]
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
    .join(' ')
    .toLowerCase();

  if (raw.includes('agent_lead_quota_exceeded')) {
    return 'agent_lead_quota_exceeded';
  }

  return 'unknown';
}

function throwMappedRpcError(error: { message?: string; details?: string | null; hint?: string | null; code?: string }): never {
  const mappedCode = getRpcErrorCode(error);
  console.log('[CONSULTATION] RPC failed:', {
    code: mappedCode,
    message: error.message,
    details: error.details,
    hint: error.hint,
    pgCode: error.code,
  });

  if (mappedCode === 'agent_lead_quota_exceeded') {
    throw new ConsultationRpcError('该代理本月名额已满，请选择其他代理或下月再试。', mappedCode);
  }

  throw new ConsultationRpcError(error.message || '提交咨询失败，请稍后重试。', mappedCode);
}

export async function createConsultation(payload: ConsultationPayload): Promise<void> {
  console.log('[CONSULTATION] Creating consultation via RPC for agent:', payload.agentId, {
    district: payload.district,
    loanType: payload.loanType,
    message: payload.message,
    state: payload.state,
    borrowerName: payload.borrowerName,
    borrowerPhone: payload.borrowerPhone,
    borrowerEmail: payload.borrowerEmail,
    loanAmount: payload.loanAmount,
    monthlyIncome: payload.monthlyIncome ?? null,
    workType: payload.workType ?? null,
    urgency: payload.urgency ?? null,
  });

  const rpcParams = {
    agent_id: payload.agentId,
    district: payload.district,
    loan_type: payload.loanType,
    message: payload.message,
    state: payload.state,
    borrower_name: payload.borrowerName,
    borrower_phone: payload.borrowerPhone,
    borrower_email: payload.borrowerEmail,
    loan_amount: payload.loanAmount,
    monthly_income: payload.monthlyIncome ?? null,
    work_type: payload.workType ?? null,
    urgency: payload.urgency ?? null,
  };

  console.log('[CONSULTATION] create_consultation rpc params:', rpcParams);

  const { error } = await supabase.rpc('create_consultation', rpcParams);

  if (error) {
    throwMappedRpcError(error);
  }
}

export async function createConsultationV2(payload: ConsultationV2Payload): Promise<void> {
  console.log('[CONSULTATION] Creating consultation v2 via RPC for agent:', payload.agentId, {
    district: payload.district,
    loanType: payload.loanType,
    state: payload.state,
    amount: payload.amount,
    monthlyIncome: payload.monthlyIncome ?? null,
    employmentType: payload.employmentType ?? null,
    urgency: payload.urgency ?? null,
  });

  const { error } = await supabase.rpc('create_consultation_v2', {
    agent_id: payload.agentId,
    district: payload.district,
    loan_type: payload.loanType,
    message: payload.message,
    state: payload.state,
    amount: payload.amount,
    monthly_income: payload.monthlyIncome ?? null,
    employment_type: payload.employmentType ?? null,
    urgency: payload.urgency ?? null,
  });

  if (error) {
    throwMappedRpcError(error);
  }
}
