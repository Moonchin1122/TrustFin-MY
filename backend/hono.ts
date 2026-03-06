import { trpcServer } from "@hono/trpc-server";
import { Hono, type Context } from "hono";
import { cors } from "hono/cors";
import Stripe from "stripe";

import { appRouter } from "./trpc/app-router";
import { createContext } from "./trpc/create-context";
import { store } from "./data/store";
import { supabaseAdmin } from "./lib/supabase";

const app = new Hono();

app.use("*", cors());

try {
  store.initDb().catch((e) => console.error('[API] DB init failed:', e));
} catch (e) {
  console.error('[API] DB init sync error:', e);
}

app.use(
  "/api/trpc/*",
  trpcServer({
    endpoint: "/api/trpc",
    router: appRouter,
    createContext,
  })
);

app.use(
  "/trpc/*",
  trpcServer({
    endpoint: "/trpc",
    router: appRouter,
    createContext,
  })
);

app.get("/", (c) => {
  return c.json({
    status: "ok",
    message: "TrustFin MY API is running",
    version: "1.0.0",
    timestamp: new Date().toISOString(),
  });
});

const healthHandler = async (c: Context) => {
  let supabaseStatus = 'unknown';
  try {
    const { error } = await supabaseAdmin.from('users').select('id', { count: 'exact', head: true });
    supabaseStatus = error ? `error: ${error.message}` : 'connected';
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    supabaseStatus = `error: ${msg}`;
  }

  return c.json({
    status: 'healthy',
    uptime: process.uptime(),
    supabase: supabaseStatus,
    env: {
      hasSupabaseUrl: !!process.env.EXPO_PUBLIC_SUPABASE_URL,
      hasAnonKey: !!process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
      hasTwilioSid: !!process.env.TWILIO_ACCOUNT_SID,
      hasTwilioToken: !!process.env.TWILIO_AUTH_TOKEN,
      hasTwilioPhone: !!process.env.TWILIO_PHONE_NUMBER,
    },
  });
};

app.get('/health', healthHandler);
app.get('/api/health', healthHandler);

const getBaseUrlFromRequest = (c: Context): string => {
  const forwardedProto = c.req.header('x-forwarded-proto');
  const forwardedHost = c.req.header('x-forwarded-host');
  const host = forwardedHost ?? c.req.header('host');
  const protocol = forwardedProto ?? 'https';

  if (!host) {
    return '';
  }

  return `${protocol}://${host}`;
};

const stripeSecretKey = process.env.STRIPE_SECRET_KEY ?? '';
const stripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET ?? '';

const stripeClient = stripeSecretKey
  ? new Stripe(stripeSecretKey, {
      apiVersion: '2026-02-25.clover',
    })
  : null;

type SubscriptionPlanKey = 'basic' | 'pro' | 'elite';

type StripeSubscriptionSyncPayload = {
  agentId: string | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string;
  stripePriceId: string | null;
  stripeCheckoutSessionId: string | null;
  plan: string;
  price: number;
  leadLimit: number | null;
  leadsUsed: number;
  status: string;
  startDate: string;
  endDate: string;
  resetUsage: boolean;
};

const PLAN_LIMITS: Record<SubscriptionPlanKey, number | null> = {
  basic: 20,
  pro: 80,
  elite: null,
};

const PLAN_PRICES: Record<SubscriptionPlanKey, number> = {
  basic: 49,
  pro: 149,
  elite: 399,
};

const normalizePlanKey = (value: string | null | undefined): SubscriptionPlanKey | null => {
  const normalized = value?.trim().toLowerCase();
  if (normalized === 'basic' || normalized === 'pro' || normalized === 'elite') {
    return normalized;
  }
  return null;
};

const resolveLeadLimit = (plan: string, fallbackLeadLimit: number | null): number | null => {
  const normalizedPlan = normalizePlanKey(plan);
  if (normalizedPlan) {
    return PLAN_LIMITS[normalizedPlan];
  }
  return fallbackLeadLimit;
};

const resolvePlanPrice = (plan: string, fallbackPrice: number): number => {
  const normalizedPlan = normalizePlanKey(plan);
  if (normalizedPlan) {
    return PLAN_PRICES[normalizedPlan];
  }
  return fallbackPrice;
};

const normalizeSubscriptionStatus = (status: string | null | undefined): string => {
  const normalized = status?.trim().toLowerCase() ?? '';
  if (normalized === 'active' || normalized === 'trialing') return 'active';
  if (normalized === 'canceled' || normalized === 'cancelled') return 'canceled';
  if (normalized === 'past_due') return 'past_due';
  if (normalized === 'unpaid') return 'unpaid';
  if (normalized === 'incomplete') return 'incomplete';
  if (normalized === 'incomplete_expired') return 'expired';
  return normalized || 'inactive';
};

const ensureAgentSubscriptionsSchema = async (): Promise<void> => {
  const sql = `
    alter table public.agent_subscriptions add column if not exists updated_at timestamptz not null default now();
    alter table public.agent_subscriptions add column if not exists stripe_customer_id text;
    alter table public.agent_subscriptions add column if not exists stripe_subscription_id text;
    alter table public.agent_subscriptions add column if not exists stripe_price_id text;
    alter table public.agent_subscriptions add column if not exists stripe_checkout_session_id text;
    create unique index if not exists idx_agent_subscriptions_stripe_subscription_id on public.agent_subscriptions(stripe_subscription_id) where stripe_subscription_id is not null;
    create index if not exists idx_agent_subscriptions_stripe_customer_id on public.agent_subscriptions(stripe_customer_id);
  `;

  const { error } = await supabaseAdmin.rpc('exec_sql', { sql });
  if (error) {
    console.error('[STRIPE-WEBHOOK] Failed ensuring subscription schema:', error.message);
    throw new Error(error.message);
  }
};

const toIsoDate = (unixSeconds: number | null | undefined, fallback: Date): string => {
  if (typeof unixSeconds === 'number' && Number.isFinite(unixSeconds) && unixSeconds > 0) {
    return new Date(unixSeconds * 1000).toISOString();
  }
  return fallback.toISOString();
};

const getSubscriptionPeriod = (subscription: Stripe.Subscription): { start: number | null; end: number | null } => {
  const rawSubscription = subscription as unknown as Record<string, unknown>;
  const start = typeof rawSubscription.current_period_start === 'number' ? rawSubscription.current_period_start : null;
  const end = typeof rawSubscription.current_period_end === 'number' ? rawSubscription.current_period_end : null;

  return { start, end };
};

const getInvoiceSubscriptionId = (invoice: Stripe.Invoice): string | null => {
  const rawInvoice = invoice as unknown as Record<string, unknown>;
  const subscriptionField = rawInvoice.subscription;

  if (typeof subscriptionField === 'string' && subscriptionField) {
    return subscriptionField;
  }

  if (subscriptionField && typeof subscriptionField === 'object') {
    const objectId = (subscriptionField as { id?: unknown }).id;
    return typeof objectId === 'string' && objectId ? objectId : null;
  }

  const parent = rawInvoice.parent;
  if (parent && typeof parent === 'object') {
    const parentSubscriptionDetails = (parent as { subscription_details?: unknown }).subscription_details;
    if (parentSubscriptionDetails && typeof parentSubscriptionDetails === 'object') {
      const metadataSubscriptionId = (parentSubscriptionDetails as { subscription?: unknown }).subscription;
      if (typeof metadataSubscriptionId === 'string' && metadataSubscriptionId) {
        return metadataSubscriptionId;
      }
    }
  }

  return null;
};

const extractAgentIdFromMetadata = (...sources: Array<Stripe.Metadata | null | undefined>): string | null => {
  for (const source of sources) {
    const agentId = source?.agent_id?.trim();
    if (agentId) {
      return agentId;
    }
  }
  return null;
};

const extractPlanFromMetadata = (...sources: Array<Stripe.Metadata | null | undefined>): string | null => {
  for (const source of sources) {
    const plan = normalizePlanKey(source?.plan);
    if (plan) {
      return plan;
    }
  }
  return null;
};

const upsertAgentSubscription = async (payload: StripeSubscriptionSyncPayload): Promise<void> => {
  console.log('[STRIPE-WEBHOOK] Syncing agent subscription payload:', payload);

  let existingRowId: string | null = null;

  if (payload.stripeSubscriptionId) {
    const { data: stripeRow, error: stripeLookupError } = await supabaseAdmin
      .from('agent_subscriptions')
      .select('id')
      .eq('stripe_subscription_id', payload.stripeSubscriptionId)
      .maybeSingle();

    if (stripeLookupError) {
      console.error('[STRIPE-WEBHOOK] Failed stripe subscription lookup:', stripeLookupError.message);
      throw new Error(stripeLookupError.message);
    }

    existingRowId = (stripeRow as { id?: string } | null)?.id ?? null;
  }

  if (!existingRowId && payload.agentId) {
    const { data: activeRow, error: activeLookupError } = await supabaseAdmin
      .from('agent_subscriptions')
      .select('id')
      .eq('agent_id', payload.agentId)
      .order('end_date', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (activeLookupError) {
      console.error('[STRIPE-WEBHOOK] Failed agent subscription lookup:', activeLookupError.message);
      throw new Error(activeLookupError.message);
    }

    existingRowId = (activeRow as { id?: string } | null)?.id ?? null;
  }

  const basePayload = {
    agent_id: payload.agentId,
    plan: payload.plan,
    price: payload.price,
    lead_limit: payload.leadLimit,
    leads_used: payload.resetUsage ? 0 : payload.leadsUsed,
    status: payload.status,
    start_date: payload.startDate,
    end_date: payload.endDate,
    stripe_customer_id: payload.stripeCustomerId,
    stripe_subscription_id: payload.stripeSubscriptionId,
    stripe_price_id: payload.stripePriceId,
    stripe_checkout_session_id: payload.stripeCheckoutSessionId,
    updated_at: new Date().toISOString(),
  };

  if (existingRowId) {
    const { error: updateError } = await supabaseAdmin
      .from('agent_subscriptions')
      .update(basePayload)
      .eq('id', existingRowId);

    if (updateError) {
      console.error('[STRIPE-WEBHOOK] Failed updating subscription row:', updateError.message);
      throw new Error(updateError.message);
    }

    console.log('[STRIPE-WEBHOOK] Updated subscription row:', existingRowId);
    return;
  }

  if (!payload.agentId) {
    throw new Error('Missing agent_id metadata for new Stripe subscription');
  }

  const insertPayload = {
    ...basePayload,
    created_at: new Date().toISOString(),
  };

  const { error: insertError } = await supabaseAdmin.from('agent_subscriptions').insert(insertPayload);
  if (insertError) {
    console.error('[STRIPE-WEBHOOK] Failed inserting subscription row:', insertError.message);
    throw new Error(insertError.message);
  }

  console.log('[STRIPE-WEBHOOK] Inserted new subscription row for agent:', payload.agentId);
};

const syncStripeSubscription = async (
  subscription: Stripe.Subscription,
  options?: {
    checkoutSessionId?: string | null;
    resetUsage?: boolean;
    agentId?: string | null;
    plan?: string | null;
  }
): Promise<void> => {
  const fallbackStartDate = new Date();
  const fallbackEndDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  const primaryItem = subscription.items.data[0];
  const metadataPlan = options?.plan ?? extractPlanFromMetadata(subscription.metadata, primaryItem?.price.metadata);
  const resolvedPlan = metadataPlan ?? 'basic';
  const leadLimit = resolveLeadLimit(resolvedPlan, null);
  const subscriptionPeriod = getSubscriptionPeriod(subscription);
  const startDate = toIsoDate(subscriptionPeriod.start, fallbackStartDate);
  const endDate = toIsoDate(subscriptionPeriod.end, fallbackEndDate);
  const amount = typeof primaryItem?.price.unit_amount === 'number'
    ? Math.round(primaryItem.price.unit_amount / 100)
    : resolvePlanPrice(resolvedPlan, 0);
  const payload: StripeSubscriptionSyncPayload = {
    agentId: options?.agentId ?? extractAgentIdFromMetadata(subscription.metadata, primaryItem?.price.metadata),
    stripeCustomerId: typeof subscription.customer === 'string' ? subscription.customer : subscription.customer?.id ?? null,
    stripeSubscriptionId: subscription.id,
    stripePriceId: primaryItem?.price.id ?? null,
    stripeCheckoutSessionId: options?.checkoutSessionId ?? null,
    plan: resolvedPlan,
    price: amount,
    leadLimit,
    leadsUsed: 0,
    status: normalizeSubscriptionStatus(subscription.status),
    startDate,
    endDate,
    resetUsage: options?.resetUsage ?? false,
  };

  await upsertAgentSubscription(payload);
};

app.get('/api/deployment-info', async (c) => {
  const baseUrl = getBaseUrlFromRequest(c);
  const webhookPath = '/api/stripe/webhook';
  const healthUrl = baseUrl ? `${baseUrl}/api/health` : null;
  const webhookUrl = baseUrl ? `${baseUrl}${webhookPath}` : null;

  console.log('[DEPLOYMENT-INFO] Base URL resolved:', baseUrl || 'missing-host-header');
  console.log('[DEPLOYMENT-INFO] Health URL:', healthUrl);
  console.log('[DEPLOYMENT-INFO] Stripe webhook URL:', webhookUrl);

  return c.json({
    status: 'ok',
    baseUrl: baseUrl || null,
    healthUrl,
    stripeWebhookUrl: webhookUrl,
    stripeWebhookPath: webhookPath,
    externallyReachable: Boolean(baseUrl),
    timestamp: new Date().toISOString(),
  });
});

app.get('/api/stripe/webhook', async (c) => {
  const baseUrl = getBaseUrlFromRequest(c);
  console.log('[STRIPE-WEBHOOK] Reachability probe received');
  return c.json({
    ok: true,
    message: 'Stripe webhook endpoint is reachable.',
    baseUrl: baseUrl || null,
    webhookUrl: baseUrl ? `${baseUrl}/api/stripe/webhook` : null,
    configured: Boolean(stripeClient && stripeWebhookSecret),
    timestamp: new Date().toISOString(),
  });
});

app.post('/api/stripe/webhook', async (c) => {
  const baseUrl = getBaseUrlFromRequest(c);
  const signatureHeader = c.req.header('stripe-signature') ?? '';
  const contentType = c.req.header('content-type') ?? '';

  console.log('[STRIPE-WEBHOOK] Incoming request:', {
    method: c.req.method,
    contentType,
    hasSignature: Boolean(signatureHeader),
    baseUrl,
  });

  if (!stripeClient || !stripeWebhookSecret) {
    console.log('[STRIPE-WEBHOOK] Stripe env missing');
    return c.json({ ok: false, message: 'Stripe webhook is not configured' }, 503);
  }

  if (!signatureHeader) {
    console.log('[STRIPE-WEBHOOK] Missing Stripe signature header');
    return c.json({ ok: false, message: 'Missing Stripe signature' }, 400);
  }

  try {
    await ensureAgentSubscriptionsSchema();

    const rawBody = await c.req.text();
    const event = await stripeClient.webhooks.constructEventAsync(rawBody, signatureHeader, stripeWebhookSecret);

    console.log('[STRIPE-WEBHOOK] Verified event:', event.id, event.type);

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const subscriptionId = typeof session.subscription === 'string' ? session.subscription : session.subscription?.id ?? null;

        if (!subscriptionId) {
          console.log('[STRIPE-WEBHOOK] checkout.session.completed missing subscription id');
          break;
        }

        const subscription = await stripeClient.subscriptions.retrieve(subscriptionId, {
          expand: ['items.data.price'],
        });

        await syncStripeSubscription(subscription, {
          checkoutSessionId: session.id,
          resetUsage: true,
          agentId: extractAgentIdFromMetadata(session.metadata, subscription.metadata),
          plan: extractPlanFromMetadata(session.metadata, subscription.metadata),
        });
        break;
      }
      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice;
        const subscriptionId = getInvoiceSubscriptionId(invoice);

        if (!subscriptionId) {
          console.log('[STRIPE-WEBHOOK] invoice.payment_succeeded missing subscription id');
          break;
        }

        const subscription = await stripeClient.subscriptions.retrieve(subscriptionId, {
          expand: ['items.data.price'],
        });

        await syncStripeSubscription(subscription, {
          resetUsage: true,
          agentId: extractAgentIdFromMetadata(invoice.parent?.subscription_details?.metadata, invoice.lines.data[0]?.metadata, subscription.metadata),
          plan: extractPlanFromMetadata(invoice.parent?.subscription_details?.metadata, invoice.lines.data[0]?.metadata, subscription.metadata),
        });
        break;
      }
      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        await syncStripeSubscription(subscription, {
          resetUsage: false,
        });
        break;
      }
      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        const primaryItem = subscription.items.data[0];
        await upsertAgentSubscription({
          agentId: extractAgentIdFromMetadata(subscription.metadata, primaryItem?.price.metadata),
          stripeCustomerId: typeof subscription.customer === 'string' ? subscription.customer : subscription.customer?.id ?? null,
          stripeSubscriptionId: subscription.id,
          stripePriceId: primaryItem?.price.id ?? null,
          stripeCheckoutSessionId: null,
          plan: extractPlanFromMetadata(subscription.metadata, primaryItem?.price.metadata) ?? 'basic',
          price: typeof primaryItem?.price.unit_amount === 'number' ? Math.round(primaryItem.price.unit_amount / 100) : 0,
          leadLimit: resolveLeadLimit(extractPlanFromMetadata(subscription.metadata, primaryItem?.price.metadata) ?? 'basic', null),
          leadsUsed: 0,
          status: 'canceled',
          startDate: toIsoDate(getSubscriptionPeriod(subscription).start, new Date()),
          endDate: toIsoDate(getSubscriptionPeriod(subscription).end, new Date()),
          resetUsage: false,
        });
        break;
      }
      default:
        console.log('[STRIPE-WEBHOOK] Ignored event type:', event.type);
        break;
    }

    return c.json({ received: true });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown Stripe webhook error';
    console.error('[STRIPE-WEBHOOK] Error handling event:', message);
    return c.json({ ok: false, message }, 400);
  }
});

app.post('/api/admin/bootstrap-auth', async (c) => {
  try {
    const body = await c.req.json<{ email?: string; password?: string }>();
    const email = (body.email ?? '').trim().toLowerCase();
    const password = (body.password ?? '').trim();

    const creds = store.getAdminCredentials();
    const expectedEmail = creds.email.trim().toLowerCase();
    const expectedPassword = creds.password.trim();

    if (!email || !password) {
      return c.json({ success: false, message: 'Email and password are required' }, 400);
    }

    if (email !== expectedEmail || password !== expectedPassword) {
      console.log('[ADMIN-BOOTSTRAP] Invalid credentials for bootstrap:', email);
      return c.json({ success: false, message: 'Invalid credentials' }, 401);
    }

    const { data: usersData, error: listError } = await supabaseAdmin.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });

    if (listError) {
      console.log('[ADMIN-BOOTSTRAP] listUsers error:', listError.message);
      return c.json({ success: false, message: 'Failed to read auth users' }, 500);
    }

    const existingAuthUser = usersData.users.find((user) => (user.email ?? '').trim().toLowerCase() === expectedEmail);

    if (!existingAuthUser) {
      const { data: createData, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email: creds.email,
        password: creds.password,
        email_confirm: true,
        user_metadata: {
          role: 'admin',
          full_name: 'Super Admin',
        },
      });

      if (createError || !createData.user) {
        console.log('[ADMIN-BOOTSTRAP] createUser error:', createError?.message);
        return c.json({ success: false, message: createError?.message ?? 'Failed to create admin auth user' }, 500);
      }

      console.log('[ADMIN-BOOTSTRAP] Admin auth user created:', createData.user.id);
    } else {
      const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(existingAuthUser.id, {
        password: creds.password,
        user_metadata: {
          ...(existingAuthUser.user_metadata ?? {}),
          role: 'admin',
          full_name: (existingAuthUser.user_metadata?.full_name as string | undefined) ?? 'Super Admin',
        },
      });

      if (updateError) {
        console.log('[ADMIN-BOOTSTRAP] updateUserById error:', updateError.message);
      } else {
        console.log('[ADMIN-BOOTSTRAP] Admin auth user password refreshed:', existingAuthUser.id);
      }
    }

    return c.json({ success: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    console.error('[ADMIN-BOOTSTRAP] Error:', msg);
    return c.json({ success: false, message: msg }, 500);
  }
});


app.post("/setup-db", async (c) => {
  try {
    const { error: usersError } = await supabaseAdmin.rpc('exec_sql', {
      sql: `
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL DEFAULT '',
          phone TEXT NOT NULL DEFAULT '',
          email TEXT DEFAULT '',
          role TEXT NOT NULL DEFAULT 'borrower',
          avatar TEXT,
          is_verified BOOLEAN DEFAULT false,
          agent_type TEXT,
          kyc_status TEXT,
          company_name TEXT,
          license_no TEXT,
          state TEXT,
          district TEXT,
          rating REAL DEFAULT 0,
          interests JSONB DEFAULT '[]'::jsonb,
          is_online BOOLEAN DEFAULT false,
          last_active_at TIMESTAMPTZ DEFAULT now(),
          created_at TIMESTAMPTZ DEFAULT now(),
          updated_at TIMESTAMPTZ DEFAULT now()
        );
      `
    });

    const { error: appsError } = await supabaseAdmin.rpc('exec_sql', {
      sql: `
        CREATE TABLE IF NOT EXISTS loan_applications (
          id TEXT PRIMARY KEY,
          user_id TEXT,
          full_name TEXT NOT NULL DEFAULT '',
          phone TEXT NOT NULL DEFAULT '',
          state TEXT DEFAULT '',
          loan_type TEXT DEFAULT '',
          amount TEXT DEFAULT '',
          mode TEXT DEFAULT 'basic',
          monthly_income TEXT,
          occupation TEXT,
          years_employed TEXT,
          has_ctos BOOLEAN,
          existing_loans TEXT,
          planned_timeline TEXT,
          lead_score REAL,
          status TEXT DEFAULT 'pending',
          created_at TIMESTAMPTZ DEFAULT now(),
          updated_at TIMESTAMPTZ DEFAULT now()
        );
      `
    });

    const { error: eventsError } = await supabaseAdmin.rpc('exec_sql', {
      sql: `
        CREATE TABLE IF NOT EXISTS analytics_events (
          id TEXT PRIMARY KEY,
          type TEXT NOT NULL,
          user_id TEXT,
          device_id TEXT NOT NULL DEFAULT '',
          screen_name TEXT,
          timestamp TIMESTAMPTZ DEFAULT now(),
          metadata JSONB
        );
      `
    });

    const { error: agentsPublicError } = await supabaseAdmin.rpc('exec_sql', {
      sql: `
        DROP VIEW IF EXISTS public.agents_public;

        CREATE VIEW public.agents_public WITH (security_invoker = on) AS
        SELECT
          a.id,
          ('Agent #' || UPPER(SUBSTRING(REPLACE(a.id::text, '-', ''), 1, 4)))::text AS masked_id,
          COALESCE(a.state, '')::text AS state,
          COALESCE(a.rating, 0)::numeric AS rating,
          COALESCE(a.verified, false) AS verified,
          COALESCE(a.created_at, NOW()) AS created_at,
          COALESCE(completed.completed_cases_count, 0)::bigint AS completed_cases_count
        FROM public.agents a
        LEFT JOIN (
          SELECT
            aa.agent_id,
            COUNT(*) FILTER (
              WHERE LOWER(COALESCE(aa.lead_status, aa.status, '')) IN ('completed', 'closed', 'won', 'approved')
            )::bigint AS completed_cases_count
          FROM public.application_assignments aa
          GROUP BY aa.agent_id
        ) completed ON completed.agent_id = a.id
        WHERE COALESCE(a.status, '') <> 'rejected';

        ALTER VIEW public.agents_public SET (security_invoker = on);
        ALTER VIEW public.agents_public OWNER TO postgres;

        ALTER TABLE public.agents ENABLE ROW LEVEL SECURITY;

        REVOKE SELECT ON TABLE public.agents FROM anon;
        GRANT SELECT ON TABLE public.agents TO authenticated;

        DROP POLICY IF EXISTS "agents_self_select" ON public.agents;
        CREATE POLICY "agents_self_select" ON public.agents
          FOR SELECT
          TO authenticated
          USING (auth.uid() = id);

        GRANT SELECT ON public.agents_public TO anon, authenticated;
      `
    });

    await store.initDb();

    const errors = [
      usersError ? `users: ${usersError.message}` : null,
      appsError ? `applications: ${appsError.message}` : null,
      eventsError ? `events: ${eventsError.message}` : null,
      agentsPublicError ? `agents_public: ${agentsPublicError.message}` : null,
    ].filter(Boolean);

    if (errors.length > 0) {
      return c.json({
        status: "partial",
        message: "Some tables may need manual creation via Supabase SQL Editor",
        errors,
        sql_to_run: SETUP_SQL,
      });
    }

    return c.json({ status: "ok", message: "Database tables created and seeded" });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return c.json({
      status: "error",
      message: msg,
      sql_to_run: SETUP_SQL,
    }, 500);
  }
});

const SETUP_SQL = `
-- Run this SQL in your Supabase SQL Editor (https://supabase.com/dashboard/project/YOUR_PROJECT/sql)

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  email TEXT DEFAULT '',
  role TEXT NOT NULL DEFAULT 'borrower',
  avatar TEXT,
  is_verified BOOLEAN DEFAULT false,
  agent_type TEXT,
  kyc_status TEXT,
  company_name TEXT,
  license_no TEXT,
  state TEXT,
  district TEXT,
  rating REAL DEFAULT 0,
  interests JSONB DEFAULT '[]'::jsonb,
  is_online BOOLEAN DEFAULT false,
  last_active_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS loan_applications (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  full_name TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  state TEXT DEFAULT '',
  loan_type TEXT DEFAULT '',
  amount TEXT DEFAULT '',
  mode TEXT DEFAULT 'basic',
  monthly_income TEXT,
  occupation TEXT,
  years_employed TEXT,
  has_ctos BOOLEAN,
  existing_loans TEXT,
  planned_timeline TEXT,
  lead_score REAL,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS analytics_events (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  user_id TEXT,
  device_id TEXT NOT NULL DEFAULT '',
  screen_name TEXT,
  timestamp TIMESTAMPTZ DEFAULT now(),
  metadata JSONB
);

-- Disable RLS for server-side access (service role key bypasses RLS anyway)
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE loan_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;

-- Allow service role full access
CREATE POLICY IF NOT EXISTS "Service role full access" ON users FOR ALL USING (true);
CREATE POLICY IF NOT EXISTS "Service role full access" ON loan_applications FOR ALL USING (true);
CREATE POLICY IF NOT EXISTS "Service role full access" ON analytics_events FOR ALL USING (true);

-- Public anonymous agents view for agent-side ranking list
DROP VIEW IF EXISTS public.agents_public;

CREATE VIEW public.agents_public WITH (security_invoker = on) AS
SELECT
  a.id,
  ('Agent #' || UPPER(SUBSTRING(REPLACE(a.id::text, '-', ''), 1, 4)))::text AS masked_id,
  COALESCE(a.state, '')::text AS state,
  COALESCE(a.rating, 0)::numeric AS rating,
  COALESCE(a.verified, false) AS verified,
  COALESCE(a.created_at, NOW()) AS created_at,
  COALESCE(completed.completed_cases_count, 0)::bigint AS completed_cases_count
FROM public.agents a
LEFT JOIN (
  SELECT
    aa.agent_id,
    COUNT(*) FILTER (
      WHERE LOWER(COALESCE(aa.lead_status, aa.status, '')) IN ('completed', 'closed', 'won', 'approved')
    )::bigint AS completed_cases_count
  FROM public.application_assignments aa
  GROUP BY aa.agent_id
) completed ON completed.agent_id = a.id
WHERE COALESCE(a.status, '') <> 'rejected';

ALTER VIEW public.agents_public SET (security_invoker = on);
ALTER VIEW public.agents_public OWNER TO postgres;

ALTER TABLE public.agents ENABLE ROW LEVEL SECURITY;
REVOKE SELECT ON TABLE public.agents FROM anon;
GRANT SELECT ON TABLE public.agents TO authenticated;

DROP POLICY IF EXISTS "agents_self_select" ON public.agents;
CREATE POLICY "agents_self_select" ON public.agents
  FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

GRANT SELECT ON public.agents_public TO anon, authenticated;

-- Seed admin user
INSERT INTO users (id, name, phone, email, role, is_verified, is_online, last_active_at, created_at, updated_at)
VALUES ('admin_001', 'Super Admin', '+60000000000', 'admin@trustfin.com', 'admin', true, false, now(), now(), now())
ON CONFLICT (id) DO NOTHING;
`;

const getAdminFromRequest = async (c: Context): Promise<{ id: string; email: string | null } | null> => {
  const authHeader = c.req.header('authorization');
  if (!authHeader) {
    return null;
  }

  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);
  if (userError || !user) {
    console.log('[ADMIN-AUTH] Auth error:', userError?.message);
    return null;
  }

  const { data: userRow } = await supabaseAdmin
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();

  const isAdminEmail = user.email === 'admin@trustfin.com' || user.email?.endsWith('@trustfin.my');
  const isAdminRole = userRow?.role === 'admin';

  if (!isAdminEmail && !isAdminRole) {
    console.log('[ADMIN-AUTH] User is not admin:', user.id, user.email, userRow?.role);
    return null;
  }

  return { id: user.id, email: user.email ?? null };
};

app.get('/api/admin/dashboard-data', async (c) => {
  try {
    const admin = await getAdminFromRequest(c);
    if (!admin) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    console.log('[ADMIN-DASHBOARD] Fetching dashboard data for admin:', admin.id);

    const [usersRes, appsRes, agentsRes, kycRes, subsRes, reportsRes] = await Promise.all([
      supabaseAdmin.from('users').select('*').order('created_at', { ascending: false }).limit(500),
      supabaseAdmin.from('applications').select('*').order('created_at', { ascending: false }).limit(500),
      supabaseAdmin.from('agents').select('*').order('created_at', { ascending: false }).limit(500),
      supabaseAdmin.from('kyc_submissions').select('*').order('created_at', { ascending: false }).limit(500),
      supabaseAdmin.from('agent_subscriptions').select('*').order('start_date', { ascending: false }).limit(500),
      supabaseAdmin.from('reports').select('*').order('created_at', { ascending: false }).limit(500),
    ]);

    if (usersRes.error || appsRes.error || agentsRes.error || kycRes.error || subsRes.error || reportsRes.error) {
      console.log('[ADMIN-DASHBOARD] Query errors:', {
        users: usersRes.error?.message,
        applications: appsRes.error?.message,
        agents: agentsRes.error?.message,
        kyc: kycRes.error?.message,
        subscriptions: subsRes.error?.message,
        reports: reportsRes.error?.message,
      });
    }

    return c.json({
      users: usersRes.data ?? [],
      applications: appsRes.data ?? [],
      agents: agentsRes.data ?? [],
      kycSubmissions: kycRes.data ?? [],
      subscriptions: subsRes.data ?? [],
      reports: reportsRes.data ?? [],
      stats: {
        totalUsers: usersRes.data?.length ?? 0,
        totalApplications: appsRes.data?.length ?? 0,
        totalAgents: agentsRes.data?.length ?? 0,
        totalSubscriptions: subsRes.data?.length ?? 0,
        totalReports: reportsRes.data?.length ?? 0,
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    console.error('[ADMIN-DASHBOARD] Error:', msg);
    return c.json({ error: msg }, 500);
  }
});

app.post('/api/admin/signed-url', async (c) => {
  try {
    const admin = await getAdminFromRequest(c);
    if (!admin) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const body = await c.req.json<{ bucket: string; path: string }>();
    const { bucket, path: filePath } = body;

    if (!bucket || !filePath) {
      return c.json({ error: 'Missing bucket or path' }, 400);
    }

    console.log('[ADMIN-SIGNED-URL] Generating signed URL for:', bucket, filePath, 'admin:', admin.id);

    const { data, error } = await supabaseAdmin.storage
      .from(bucket)
      .createSignedUrl(filePath, 600);

    if (error) {
      console.log('[ADMIN-SIGNED-URL] Storage error:', error.message);
      return c.json({ error: 'Storage error: ' + error.message }, 500);
    }

    return c.json({ signedUrl: data.signedUrl });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    console.error('[ADMIN-SIGNED-URL] Error:', msg);
    return c.json({ error: msg }, 500);
  }
});

app.onError((err, c) => {
  console.error("[API] Unhandled error:", err.message);
  return c.json({ error: err.message || "Internal server error" }, 500);
});

export default app;
export { app };
