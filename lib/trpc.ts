import { httpLink } from "@trpc/client";
import { createTRPCReact } from "@trpc/react-query";
import superjson from "superjson";

import type { AppRouter } from "@/backend/trpc/app-router";

export const trpc = createTRPCReact<AppRouter>();

const DEV = typeof __DEV__ !== 'undefined' ? __DEV__ : false;

const normalizeUrl = (url: string): string => url.trim().replace(/\/+$/, '');

const getWebOrigin = (): string => {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return normalizeUrl(window.location.origin);
  }

  return '';
};

const getBaseUrlCandidates = (): string[] => {
  const envBaseUrl = normalizeUrl(process.env.EXPO_PUBLIC_RORK_API_BASE_URL ?? '');
  const toolkitUrl = normalizeUrl(process.env.EXPO_PUBLIC_TOOLKIT_URL ?? '');
  const webOrigin = getWebOrigin();

  const orderedCandidates = typeof window !== 'undefined'
    ? [webOrigin, envBaseUrl, toolkitUrl]
    : [envBaseUrl, toolkitUrl, webOrigin];

  const candidates = orderedCandidates.filter((url) => url.length > 0);
  return Array.from(new Set(candidates));
};

const buildTrpcEndpointCandidates = (baseUrl: string): string[] => {
  const normalizedBaseUrl = normalizeUrl(baseUrl);

  if (normalizedBaseUrl.endsWith('/api/trpc')) {
    return [normalizedBaseUrl, `${normalizedBaseUrl.slice(0, -9)}/trpc`];
  }

  if (normalizedBaseUrl.endsWith('/trpc')) {
    return [normalizedBaseUrl, `${normalizedBaseUrl.slice(0, -5)}/api/trpc`];
  }

  if (normalizedBaseUrl.endsWith('/api')) {
    return [`${normalizedBaseUrl}/trpc`, `${normalizedBaseUrl.slice(0, -4)}/api/trpc`];
  }

  return [`${normalizedBaseUrl}/api/trpc`, `${normalizedBaseUrl}/trpc`];
};

const baseUrlCandidates = getBaseUrlCandidates();
const trpcEndpointCandidates = Array.from(
  new Set(baseUrlCandidates.flatMap((baseUrl) => buildTrpcEndpointCandidates(baseUrl)))
);

const trpcUrl = typeof window !== 'undefined'
  ? '/api/trpc'
  : (trpcEndpointCandidates[0] ?? '/api/trpc');
const resolvedApiBaseUrl = baseUrlCandidates[0] ?? '';

if (DEV) {
  console.log('[TRPC] EXPO_PUBLIC_RORK_API_BASE_URL:', process.env.EXPO_PUBLIC_RORK_API_BASE_URL ?? '');
  console.log('[TRPC] Resolved API base URL:', resolvedApiBaseUrl || '(empty)');
  console.log('[TRPC] Final constructed tRPC URL:', trpcUrl);
  console.log('[TRPC] tRPC endpoint candidates:', trpcEndpointCandidates);
}

const buildHealthCheckUrls = (baseUrl: string): string[] => {
  const normalizedBaseUrl = normalizeUrl(baseUrl);

  if (!normalizedBaseUrl) {
    return [];
  }

  if (normalizedBaseUrl.endsWith('/api')) {
    return [
      `${normalizedBaseUrl}/health`,
      `${normalizedBaseUrl.slice(0, -4)}/health`,
    ];
  }

  return [
    `${normalizedBaseUrl}/health`,
    `${normalizedBaseUrl}/api/health`,
  ];
};

let healthCheckPromise: Promise<void> | null = null;

const ensureBackendHealth = async (): Promise<void> => {
  if (healthCheckPromise) {
    return healthCheckPromise;
  }

  healthCheckPromise = (async () => {
    if (!resolvedApiBaseUrl) {
      if (DEV) {
        console.warn('[TRPC] Skipping health check: no resolved API base URL');
      }
      return;
    }

    const healthUrls = buildHealthCheckUrls(resolvedApiBaseUrl);
    let lastStatus: number | null = null;
    let lastError = '';

    for (const healthUrl of healthUrls) {
      try {
        if (DEV) {
          console.log('[TRPC] Health check request:', healthUrl);
        }

        const res = await fetch(healthUrl, { method: 'GET' });
        lastStatus = res.status;

        if (res.ok) {
          if (DEV) {
            console.log('[TRPC] Health check OK:', healthUrl, 'status:', res.status);
          }
          return;
        }

        lastError = `status ${res.status}`;
      } catch (error: unknown) {
        lastError = error instanceof Error ? error.message : 'Unknown health check error';
      }
    }

    if (DEV) {
      console.warn(`[TRPC] Health check failed (non-blocking): ${healthUrls.join(' or ')}. Last result: ${lastStatus ?? 'no response'} ${lastError}`.trim());
    }
  })();

  return healthCheckPromise;
};

const getResolvedRequestUrl = (url: URL | RequestInfo): string => {
  if (typeof url === 'string') {
    return url;
  }

  if (url instanceof URL) {
    return url.toString();
  }

  if (typeof Request !== 'undefined' && url instanceof Request) {
    return url.url;
  }

  if (typeof url === 'object' && url !== null && 'url' in url && typeof url.url === 'string') {
    return url.url;
  }

  return '';
};

const getTrpcPathSuffix = (pathname: string): string => {
  if (pathname.startsWith('/api/trpc')) {
    return pathname.slice('/api/trpc'.length);
  }

  if (pathname.startsWith('/trpc')) {
    return pathname.slice('/trpc'.length);
  }

  return '';
};

const buildFallbackRequestUrls = (requestUrl: string): string[] => {
  try {
    const parsed = new URL(requestUrl);
    const suffix = getTrpcPathSuffix(parsed.pathname);
    const search = parsed.search;

    const sameOriginCandidates = [`${parsed.origin}/api/trpc`, `${parsed.origin}/trpc`];
    const candidates = [
      ...trpcEndpointCandidates,
      ...sameOriginCandidates,
    ];

    const rebuilt = candidates
      .map((endpoint) => `${normalizeUrl(endpoint)}${suffix}${search}`)
      .filter((candidate) => candidate !== requestUrl);

    return Array.from(new Set(rebuilt));
  } catch {
    return [];
  }
};

const readBodyPreview = async (response: Response): Promise<string> => {
  try {
    const body = await response.clone().text();
    return body.slice(0, 200);
  } catch {
    return '';
  }
};

const tryFallbackRequest = async (requestUrl: string, options?: RequestInit): Promise<Response | null> => {
  const fallbackUrls = buildFallbackRequestUrls(requestUrl);

  for (const fallbackUrl of fallbackUrls) {
    try {
      if (DEV) {
        console.warn('[TRPC] Retrying with fallback endpoint:', fallbackUrl);
      }

      const response = await fetch(fallbackUrl, options);
      const contentType = response.headers.get('content-type') ?? '';

      if (response.ok && contentType.includes('application/json')) {
        return response;
      }

      if (DEV && !contentType.includes('application/json')) {
        const preview = await readBodyPreview(response);
        console.warn('[TRPC] Fallback non-JSON response:', response.status, preview);
      }
    } catch (error: unknown) {
      if (DEV) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.warn('[TRPC] Fallback request failed:', fallbackUrl, message);
      }
    }
  }

  return null;
};

const createNetworkError = (requestUrl: string, error: unknown): Error => {
  const message = error instanceof Error ? error.message : 'Unknown network error';
  return new Error(`[TRPC] Network request failed for ${requestUrl}: ${message}`);
};

export const trpcClient = trpc.createClient({
  links: [
    httpLink({
      url: trpcUrl,
      transformer: superjson,
      async fetch(url, options) {
        await ensureBackendHealth();

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 45000);
        const signal = options?.signal ?? controller.signal;
        const requestOptions: RequestInit = { ...options, signal };
        const requestUrl = getResolvedRequestUrl(url);

        if (DEV) {
          console.log('[TRPC] Request started:', requestUrl);
        }

        try {
          let response: Response;

          try {
            response = await fetch(url, requestOptions);
          } catch (initialError: unknown) {
            const fallbackResponse = await tryFallbackRequest(requestUrl, requestOptions);
            if (!fallbackResponse) {
              throw createNetworkError(requestUrl, initialError);
            }
            response = fallbackResponse;
          }

          const contentType = response.headers.get('content-type') ?? '';
          const shouldFallback = response.status === 404 || !contentType.includes('application/json');

          if (shouldFallback) {
            const fallbackResponse = await tryFallbackRequest(requestUrl, requestOptions);
            if (fallbackResponse) {
              response = fallbackResponse;
            }
          }

          const finalContentType = response.headers.get('content-type') ?? '';
          if (!finalContentType.includes('application/json')) {
            const bodyPreview = await readBodyPreview(response);
            if (DEV) {
              console.error('[TRPC] Non-JSON response. Status:', response.status, 'Content-Type:', finalContentType, 'Body preview:', bodyPreview);
            }

            const detail = DEV
              ? `status ${response.status}, body preview: ${bodyPreview}`
              : `status ${response.status}`;
            throw new Error(`[TRPC] API returned non-JSON response (${detail})`);
          }

          if (DEV) {
            console.log('[TRPC] Request finished:', requestUrl, 'status:', response.status);
          }

          return response;
        } catch (error: unknown) {
          const wrappedError = error instanceof Error && error.message.startsWith('[TRPC]')
            ? error
            : createNetworkError(requestUrl, error);
          if (DEV) {
            console.error('[TRPC] Request failed:', wrappedError.message, 'URL:', requestUrl);
          }
          throw wrappedError;
        } finally {
          clearTimeout(timeoutId);
        }
      },
    }),
  ],
});
