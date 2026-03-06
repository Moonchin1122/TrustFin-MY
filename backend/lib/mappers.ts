import type { StoredUser, LoanApplication } from '../data/store';

export interface UserResponse {
  id: string;
  name: string;
  phone: string;
  email: string;
  role: string;
  avatar?: string;
  isVerified: boolean;
  agentType?: string;
  kycStatus?: string;
  companyName?: string;
  licenseNo?: string;
  state?: string;
  district?: string;
  rating?: number;
  interests?: string[];
  isOnline: boolean;
  lastActiveAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface ApplicationResponse {
  id: string;
  userId?: string;
  fullName: string;
  phone: string;
  state: string;
  loanType: string;
  amount: string;
  mode: 'basic' | 'premium';
  monthlyIncome?: string;
  occupation?: string;
  yearsEmployed?: string;
  hasCtos?: boolean;
  existingLoans?: string;
  plannedTimeline?: string;
  leadScore?: number;
  status: 'pending' | 'reviewing' | 'approved' | 'rejected';
  createdAt: string;
  updatedAt: string;
}

export function mapUser(u: StoredUser): UserResponse {
  return {
    id: u.id,
    name: u.name,
    phone: u.phone,
    email: u.email,
    role: u.role,
    avatar: u.avatar,
    isVerified: u.is_verified,
    agentType: u.agent_type,
    kycStatus: u.kyc_status,
    companyName: u.company_name,
    licenseNo: u.license_no,
    state: u.state,
    district: u.district,
    rating: u.rating,
    interests: u.interests,
    isOnline: u.is_online,
    lastActiveAt: u.last_active_at,
    createdAt: u.created_at,
    updatedAt: u.updated_at,
  };
}

export function mapApplication(a: LoanApplication): ApplicationResponse {
  return {
    id: a.id,
    userId: a.user_id,
    fullName: a.full_name,
    phone: a.phone,
    state: a.state,
    loanType: a.loan_type,
    amount: a.amount,
    mode: a.mode,
    monthlyIncome: a.monthly_income,
    occupation: a.occupation,
    yearsEmployed: a.years_employed,
    hasCtos: a.has_ctos,
    existingLoans: a.existing_loans,
    plannedTimeline: a.planned_timeline,
    leadScore: a.lead_score,
    status: a.status,
    createdAt: a.created_at,
    updatedAt: a.updated_at,
  };
}
