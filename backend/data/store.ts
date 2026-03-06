import { supabaseAdmin } from '../lib/supabase';

export interface StoredUser {
  id: string;
  name: string;
  phone: string;
  email: string;
  role: "guest" | "borrower" | "agent" | "admin";
  avatar?: string;
  is_verified: boolean;
  agent_type?: "individual" | "company";
  kyc_status?: "none" | "pending" | "verified" | "rejected";
  company_name?: string;
  license_no?: string;
  state?: string;
  district?: string;
  rating?: number;
  interests?: string[];
  is_online: boolean;
  last_active_at: string;
  created_at: string;
  updated_at: string;
}

export interface LoanApplication {
  id: string;
  user_id?: string;
  full_name: string;
  phone: string;
  state: string;
  loan_type: string;
  amount: string;
  mode: "basic" | "premium";
  monthly_income?: string;
  occupation?: string;
  years_employed?: string;
  has_ctos?: boolean;
  existing_loans?: string;
  planned_timeline?: string;
  lead_score?: number;
  status: "pending" | "reviewing" | "approved" | "rejected";
  created_at: string;
  updated_at: string;
}

export interface AnalyticsEvent {
  id: string;
  type: "install" | "app_open" | "screen_view" | "signup";
  user_id?: string;
  device_id: string;
  screen_name?: string;
  timestamp: string;
  metadata?: Record<string, string>;
}

const ADMIN_EMAIL = "admin@trustfin.com";
const ADMIN_PASSWORD = "TrustFin@2024";

export const store = {
  getAdminCredentials: () => ({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),

  initDb: async () => {
    try {
      const { data: existingAdmin } = await supabaseAdmin
        .from('users')
        .select('id')
        .eq('email', ADMIN_EMAIL)
        .single();

      if (!existingAdmin) {
        const now = new Date().toISOString();
        await supabaseAdmin.from('users').insert({
          id: 'admin_001',
          name: 'Super Admin',
          phone: '+60000000000',
          email: ADMIN_EMAIL,
          role: 'admin',
          is_verified: true,
          is_online: false,
          last_active_at: now,
          created_at: now,
          updated_at: now,
        });
        console.log('[STORE] Admin user seeded');
      }
      console.log('[STORE] DB initialized');
    } catch (e) {
      console.error('[STORE] DB init error:', e);
    }
  },

  getUser: async (id: string): Promise<StoredUser | null> => {
    const { data, error } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('id', id)
      .single();
    if (error) {
      console.log('[STORE] getUser error:', error.message);
      return null;
    }
    return data as StoredUser;
  },

  getUserByPhone: async (phone: string): Promise<StoredUser | null> => {
    const { data, error } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('phone', phone)
      .single();
    if (error) return null;
    return data as StoredUser;
  },

  getUserByEmail: async (email: string): Promise<StoredUser | null> => {
    const { data, error } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('email', email)
      .single();
    if (error) return null;
    return data as StoredUser;
  },

  createUser: async (user: StoredUser): Promise<StoredUser> => {
    const { data, error } = await supabaseAdmin
      .from('users')
      .insert(user)
      .select()
      .single();
    if (error) {
      console.error('[STORE] createUser error:', error.message);
      throw new Error(error.message);
    }
    console.log('[STORE] User created:', data.id);
    return data as StoredUser;
  },

  updateUser: async (id: string, updates: Partial<StoredUser>): Promise<StoredUser | null> => {
    const { data, error } = await supabaseAdmin
      .from('users')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) {
      console.log('[STORE] updateUser error:', error.message);
      return null;
    }
    return data as StoredUser;
  },

  deleteUser: async (id: string): Promise<boolean> => {
    const { error } = await supabaseAdmin
      .from('users')
      .delete()
      .eq('id', id);
    return !error;
  },

  getAllUsers: async (): Promise<StoredUser[]> => {
    const { data, error } = await supabaseAdmin
      .from('users')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) {
      console.error('[STORE] getAllUsers error:', error.message);
      return [];
    }
    return (data || []) as StoredUser[];
  },

  getUserCount: async (): Promise<number> => {
    const { count, error } = await supabaseAdmin
      .from('users')
      .select('*', { count: 'exact', head: true });
    if (error) return 0;
    return count || 0;
  },

  getOnlineUsers: async (): Promise<number> => {
    const { count, error } = await supabaseAdmin
      .from('users')
      .select('*', { count: 'exact', head: true })
      .eq('is_online', true);
    if (error) return 0;
    return count || 0;
  },

  getSignupsInRange: async (startDate: Date, endDate: Date): Promise<number> => {
    const { count, error } = await supabaseAdmin
      .from('users')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', startDate.toISOString())
      .lte('created_at', endDate.toISOString());
    if (error) return 0;
    return count || 0;
  },

  getPopularInterests: async (): Promise<{ name: string; count: number }[]> => {
    const { data } = await supabaseAdmin
      .from('users')
      .select('interests')
      .not('interests', 'is', null);
    if (!data) return [];
    const counts: Record<string, number> = {};
    for (const row of data) {
      const interests = row.interests as string[] | null;
      if (interests) {
        for (const interest of interests) {
          counts[interest] = (counts[interest] || 0) + 1;
        }
      }
    }
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name, count]) => ({ name, count }));
  },

  getSignupTrend: async (days: number): Promise<{ date: string; count: number }[]> => {
    const trend: { date: string; count: number }[] = [];
    const now = new Date();
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split("T")[0];
      const dayStart = new Date(dateStr + "T00:00:00.000Z");
      const dayEnd = new Date(dateStr + "T23:59:59.999Z");

      const { count } = await supabaseAdmin
        .from('users')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', dayStart.toISOString())
        .lte('created_at', dayEnd.toISOString());

      trend.push({ date: dateStr, count: count || 0 });
    }
    return trend;
  },

  getRetentionStats: async (): Promise<{ day1: number; day7: number }> => {
    const now = new Date();
    const day1 = new Date(now);
    day1.setDate(day1.getDate() - 1);
    const day7 = new Date(now);
    day7.setDate(day7.getDate() - 7);

    const { count: totalUsers } = await supabaseAdmin
      .from('users')
      .select('*', { count: 'exact', head: true });

    if (!totalUsers || totalUsers === 0) return { day1: 0, day7: 0 };

    const { count: day1Active } = await supabaseAdmin
      .from('users')
      .select('*', { count: 'exact', head: true })
      .gte('last_active_at', day1.toISOString());

    const { count: day7Active } = await supabaseAdmin
      .from('users')
      .select('*', { count: 'exact', head: true })
      .gte('last_active_at', day7.toISOString());

    return {
      day1: Math.round(((day1Active || 0) / totalUsers) * 100),
      day7: Math.round(((day7Active || 0) / totalUsers) * 100),
    };
  },

  addEvent: async (event: AnalyticsEvent): Promise<void> => {
    const { error } = await supabaseAdmin
      .from('analytics_events')
      .insert(event);
    if (error) {
      console.error('[STORE] addEvent error:', error.message);
    }
  },

  getEvents: async (): Promise<AnalyticsEvent[]> => {
    const { data } = await supabaseAdmin
      .from('analytics_events')
      .select('*')
      .order('timestamp', { ascending: false })
      .limit(1000);
    return (data || []) as AnalyticsEvent[];
  },

  getEventsByType: async (type: string): Promise<AnalyticsEvent[]> => {
    const { data } = await supabaseAdmin
      .from('analytics_events')
      .select('*')
      .eq('type', type);
    return (data || []) as AnalyticsEvent[];
  },

  getUniqueInstalls: async (): Promise<number> => {
    const { data } = await supabaseAdmin
      .from('analytics_events')
      .select('device_id')
      .eq('type', 'install');
    if (!data) return 0;
    const unique = new Set(data.map((d: { device_id: string }) => d.device_id));
    return unique.size;
  },

  getActiveUsersInRange: async (startDate: Date, endDate: Date): Promise<number> => {
    const { data } = await supabaseAdmin
      .from('analytics_events')
      .select('user_id')
      .gte('timestamp', startDate.toISOString())
      .lte('timestamp', endDate.toISOString())
      .not('user_id', 'is', null);
    if (!data) return 0;
    const unique = new Set(data.map((d: { user_id: string }) => d.user_id));
    return unique.size;
  },

  getScreenViewCounts: async (): Promise<Record<string, number>> => {
    const { data } = await supabaseAdmin
      .from('analytics_events')
      .select('screen_name')
      .eq('type', 'screen_view')
      .not('screen_name', 'is', null);
    if (!data) return {};
    const counts: Record<string, number> = {};
    for (const row of data) {
      const name = row.screen_name as string;
      if (name) {
        counts[name] = (counts[name] || 0) + 1;
      }
    }
    return counts;
  },

  createApplication: async (app: LoanApplication): Promise<LoanApplication> => {
    const { data, error } = await supabaseAdmin
      .from('loan_applications')
      .insert(app)
      .select()
      .single();
    if (error) {
      console.error('[STORE] createApplication error:', error.message);
      throw new Error(error.message);
    }
    console.log('[STORE] Application created:', data.id);
    return data as LoanApplication;
  },

  getApplication: async (id: string): Promise<LoanApplication | null> => {
    const { data } = await supabaseAdmin
      .from('loan_applications')
      .select('*')
      .eq('id', id)
      .single();
    return (data as LoanApplication) || null;
  },

  getAllApplications: async (): Promise<LoanApplication[]> => {
    const { data, error } = await supabaseAdmin
      .from('loan_applications')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) {
      console.error('[STORE] getAllApplications error:', error.message);
      return [];
    }
    return (data || []) as LoanApplication[];
  },

  getApplicationCount: async (): Promise<number> => {
    const { count } = await supabaseAdmin
      .from('loan_applications')
      .select('*', { count: 'exact', head: true });
    return count || 0;
  },

  updateApplication: async (id: string, updates: Partial<LoanApplication>): Promise<LoanApplication | null> => {
    const { data, error } = await supabaseAdmin
      .from('loan_applications')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) {
      console.log('[STORE] updateApplication error:', error.message);
      return null;
    }
    return data as LoanApplication;
  },

  getApplicationsByStatus: async (status: string): Promise<LoanApplication[]> => {
    const { data } = await supabaseAdmin
      .from('loan_applications')
      .select('*')
      .eq('status', status);
    return (data || []) as LoanApplication[];
  },
};
