// Pages Function: proxy all /api/* requests to the API Worker
// Dev auth is injected server-side via Pages secrets — never reaches the browser.
// TODO: Remove dev auth injection once Cloudflare Access is configured.
const API_WORKER_URL = 'https://studioflow360-api.samuel-1e5.workers.dev';

interface PagesEnv {
  DEV_AUTH_EMAIL: string;
  DEV_AUTH_SECRET: string;
}

export const onRequest: PagesFunction<PagesEnv> = async (context) => {
  const url = new URL(context.request.url);
  const pathSegments = context.params.path;
  const apiPath = `/api/${Array.isArray(pathSegments) ? pathSegments.join('/') : pathSegments}`;
  const targetUrl = `${API_WORKER_URL}${apiPath}${url.search}`;

  // Handle CORS preflight
  if (context.request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': url.origin,
        'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Credentials': 'true',
        'Access-Control-Max-Age': '86400',
      },
    });
  }

  const headers = new Headers(context.request.headers);
  headers.set('X-Forwarded-Host', url.hostname);

  // Inject dev auth from Pages environment secrets
  const email = context.env.DEV_AUTH_EMAIL;
  const secret = context.env.DEV_AUTH_SECRET;
  if (email && secret) {
    headers.set('X-Dev-Email', email);
    headers.set('X-Dev-Secret', secret);
  }

  const response = await fetch(targetUrl, {
    method: context.request.method,
    headers,
    body: context.request.method !== 'GET' && context.request.method !== 'HEAD'
      ? context.request.body
      : undefined,
  });

  const responseHeaders = new Headers(response.headers);
  responseHeaders.set('Access-Control-Allow-Origin', url.origin);
  responseHeaders.set('Access-Control-Allow-Credentials', 'true');

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: responseHeaders,
  });
};
