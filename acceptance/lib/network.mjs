import { verifyIdentity } from './state.mjs';
import { uuidPattern } from './config.mjs';

const id = '[0-9a-fA-F-]{36}';
const publicPages = /^\/(?:|about|contact|privacy|terms|plans|radar(?:\/.*)?|admin(?:\/.*)?)$/;
const reads = [
  /^\/api\/v1\/(?:users\/me|content\/(?:about|privacy|terms)|subscription(?:\/plans|\/enrolment-plans|\/free-digests|\/billing(?:\/changes|\/upgrades|\/active-digests|\/notifications)?)?|digest-runs\/active)$/,
  new RegExp(`^/api/v1/digests(?:/${id}(?:/runs(?:/${id})?|/schedule/preview)?)?$`),
  new RegExp(`^/api/v1/subscription/digests/${id}$`),
];
const adminReads = [
  new RegExp(`^/api/v1/admin/(?:users(?:/${id}(?:/closure)?)?|digests(?:/${id}(?:/runs(?:/${id})?)?)?|messages|subscription-testing/mode)$`),
  new RegExp(`^/api/v1/admin/subscription-access/${id}$`),
];
const fields = new Set(['topic', 'description', 'include_keywords', 'exclude_keywords', 'target_audience', 'reporting_from', 'reporting_to', 'maximum_papers']);

/** Deny by default: the only real non-auth writes are to one newly created smoke digest. */
export function requestDecision(config, state, urlString, method, body) {
  let url;
  try { url = new URL(urlString); } catch { return 'deny'; }
  if (url.origin !== config.baseURL || url.username || url.password || /%2f|%5c|%2e|\\/i.test(url.pathname)) return 'deny';
  const p = url.pathname;
  if (method === 'POST' && p === '/api/v1/auth/refresh') return 'allow';
  if (method === 'POST' && p === '/api/v1/auth/login' && state.login &&
      body?.email?.toLowerCase() === (state.role === 'admin' ? config.adminEmail : config.userEmail)) return 'allow';
  if (method === 'GET' || method === 'HEAD') {
    if (p.startsWith('/api/')) return [...reads, ...(state.role === 'admin' ? adminReads : [])].some(re => re.test(p)) ? 'allow' : 'deny';
    return publicPages.test(p) || /^\/(?:assets\/[^?]+|[^/]+\.(?:svg|png|ico|webp|css|js|woff2?))$/.test(p) ? 'allow' : 'deny';
  }
  if (method === 'POST' && p === '/api/v1/digests' && state.simulateCreateFailure) return 'simulate';
  if (!state.verifiedUser || state.role !== 'user' || !state.allowWrites || !config.allowDigestWrites || !state.topic) return 'deny';
  if (method === 'DELETE') return state.createdId && p === `/api/v1/digests/${state.createdId}` ? 'allow' : 'deny';
  if (!body || Object.keys(body).some(key => !fields.has(key)) || body.topic !== state.topic || body.maximum_papers !== 1) return 'deny';
  if (method === 'POST' && p === '/api/v1/digests' && !state.createAttempted) return 'allow';
  if (method === 'PATCH' && state.createdId && p === `/api/v1/digests/${state.createdId}`) return 'allow';
  return 'deny';
}

export async function installGuard(context, config, role, options = {}) {
  const state = { role, login: !!options.login, verifiedUser: null, allowWrites: !!options.allowWrites,
    topic: null, createdId: null, createAttempted: false, simulateCreateFailure: false };
  const violations = [], snapshots = new Map(), writes = [];
  function violation(message) { violations.push(message); }
  await context.routeWebSocket('**/*', ws => { violation('WebSocket request blocked.'); ws.close(); });
  await context.route('**/*', async route => {
    const request = route.request();
    const method = request.method(), url = new URL(request.url());
    let body;
    try { body = request.postDataJSON(); } catch { body = null; }
    const decision = requestDecision(config, state, request.url(), method, body);
    if (decision === 'deny') {
      // Never record request bodies, cookies, tokens or full query strings.
      violation(`Blocked ${method} ${url.origin === config.baseURL ? url.pathname : '[external origin]'}`);
      await route.abort('blockedbyclient'); return;
    }
    if (decision === 'simulate') {
      state.simulateCreateFailure = false;
      await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ detail: 'Acceptance-only simulated save failure.' }) }); return;
    }
    if (method === 'POST' && url.pathname === '/api/v1/digests') state.createAttempted = true;
    try {
      // route.fetch is used instead of continue so redirects cannot escape the approved origin.
      const response = await route.fetch({ maxRedirects: 0, timeout: 20000 });
      if (response.status() >= 300 && response.status() < 400) {
        violation('Unexpected HTTP redirect blocked.'); await route.abort('blockedbyclient'); return;
      }
      if (url.pathname.startsWith('/api/') && response.ok() && response.headers()['content-type']?.includes('application/json')) {
        const data = await response.json();
        if (url.pathname === '/api/v1/auth/login' || url.pathname === '/api/v1/auth/refresh' || url.pathname === '/api/v1/users/me') {
          if (role !== 'public') state.verifiedUser = verifyIdentity(data.user ?? data, config, role);
          else throw Error('Unexpected authenticated public browser context.');
        }
        if (['/api/v1/subscription/plans', '/api/v1/subscription/billing'].includes(url.pathname) && data.sandbox !== true) throw Error('Sandbox mode changed or is unavailable.');
        if (url.pathname === '/api/v1/admin/subscription-testing/mode' && data.mode !== 'sandbox') throw Error('Non-sandbox admin deployment.');
        // Keep read snapshots in memory for exact assertions; never persist full API records in reports.
        if (method === 'GET') snapshots.set(url.pathname, data);
        if (method === 'POST' && url.pathname === '/api/v1/digests') {
          if (!uuidPattern.test(data.id) || data.topic !== state.topic || data.owner_id !== state.verifiedUser?.id) throw Error('Created digest identity did not match the isolated smoke record.');
          state.createdId = data.id;
        }
      }
      if (!['GET', 'HEAD'].includes(method) && !url.pathname.startsWith('/api/v1/auth/')) writes.push({ method, path: url.pathname, status: response.status() });
      await route.fulfill({ response });
    } catch (error) {
      violation(`Could not safely complete ${method} ${url.pathname}. Refresh/authenticate before retrying.`);
      await route.abort('failed').catch(() => {});
    }
  });
  return {
    state, snapshots, writes, violations,
    simulateSaveFailure() { state.simulateCreateFailure = true; },
    permitNewDigest(topic) {
      if (!options.allowWrites || !config.allowDigestWrites || !topic.startsWith('Acceptance smoke ')) throw Error('Digest writes require both configuration and explicit invocation approval.');
      state.topic = topic;
    },
    assertSafe() { if (violations.length) throw Error([...new Set(violations)].join('\n')); },
  };
}
