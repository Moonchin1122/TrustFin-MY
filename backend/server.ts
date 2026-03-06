import { serve } from '@hono/node-server';

import { app } from '@/backend/hono';

const parsedPort = Number(process.env.PORT ?? '3000');
const port = Number.isFinite(parsedPort) && parsedPort > 0 ? parsedPort : 3000;
const host = process.env.HOST ?? '0.0.0.0';

console.log('[RAILWAY] Preparing backend server bootstrap');
console.log('[RAILWAY] Runtime env:', {
  host,
  port,
  nodeEnv: process.env.NODE_ENV ?? 'development',
  hasStripeSecret: Boolean(process.env.STRIPE_SECRET_KEY),
  hasStripeWebhookSecret: Boolean(process.env.STRIPE_WEBHOOK_SECRET),
  hasSupabaseUrl: Boolean(process.env.EXPO_PUBLIC_SUPABASE_URL),
  hasSupabaseServiceRoleKey: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
});

serve(
  {
    fetch: app.fetch,
    hostname: host,
    port,
  },
  (info) => {
    console.log('[RAILWAY] Backend server is running');
    console.log('[RAILWAY] Listening info:', info);
    console.log(`[RAILWAY] Health check: http://${host}:${info.port}/api/health`);
    console.log(`[RAILWAY] Deployment info: http://${host}:${info.port}/api/deployment-info`);
    console.log(`[RAILWAY] Stripe webhook probe: http://${host}:${info.port}/api/stripe/webhook`);
  }
);
