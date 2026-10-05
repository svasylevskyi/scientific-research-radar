import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const root = fileURLToPath(new URL('../', import.meta.url));
export const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const keys = new Set(['environment', 'baseURL', 'allowedOrigin', 'releaseCommit', 'userEmail',
  'adminEmail', 'digestId', 'runId', 'allowDigestWrites', 'captureDiagnostics']);

/** Explicit origin approval plus a canonical sandbox preflight; no default target. */
export function validateConfig(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Expected an acceptance configuration object.');
  if (Object.keys(value).some(key => !keys.has(key))) throw Error('Unknown acceptance configuration field.');
  if (value.environment !== 'development') throw Error('Only development acceptance is supported.');
  let url;
  try { url = new URL(value.baseURL); } catch { throw Error('Set baseURL to your development HTTPS origin.'); }
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/' ||
      url.protocol !== 'https:' || url.origin !== value.allowedOrigin) {
    throw Error('baseURL must be an HTTPS origin exactly matching allowedOrigin, without credentials, paths or query parameters.');
  }
  if (/(^|[.-])(prod|production)([.-]|$)/i.test(url.hostname) || url.hostname.endsWith('.invalid')) {
    throw Error('Production-looking and placeholder hosts are not accepted.');
  }
  if (!/^[0-9a-f]{40}$/i.test(value.releaseCommit ?? '')) throw Error('Record the full deployed commit in releaseCommit.');
  if (typeof value.userEmail !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.userEmail)) {
    throw Error('Configure a dedicated ordinary user email.');
  }
  if (value.adminEmail != null && (typeof value.adminEmail !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.adminEmail))) {
    throw Error('adminEmail must be an ordinary admin email or null.');
  }
  if (value.adminEmail && value.adminEmail.toLowerCase() === value.userEmail.toLowerCase()) throw Error('User and admin test accounts must differ.');
  for (const key of ['digestId', 'runId']) if (value[key] != null && !uuidPattern.test(value[key])) throw Error(`${key} must be a UUID or null.`);
  if (value.runId && !value.digestId) throw Error('runId requires digestId.');
  for (const key of ['allowDigestWrites', 'captureDiagnostics']) if (typeof value[key] !== 'boolean') throw Error(`${key} must be explicitly true or false.`);
  return Object.freeze({ ...value, baseURL: url.origin, userEmail: value.userEmail.toLowerCase(), adminEmail: value.adminEmail?.toLowerCase() ?? null });
}
export function readConfig() {
  const filename = process.env.RADAR_ACCEPTANCE_CONFIG || path.join(root, 'acceptance.local.json');
  try { return validateConfig(JSON.parse(readFileSync(filename, 'utf8'))); }
  catch (error) { throw Error(`Acceptance configuration: ${error.code === 'ENOENT' ? 'copy acceptance.example.json to acceptance.local.json and fill it in.' : error.message}`); }
}
export async function preflight(config, fetcher = fetch) {
  // No credentials, no redirects, and no writes before verifying the target.
  const response = await fetcher(`${config.baseURL}/api/v1/subscription/plans`, {
    redirect: 'manual', credentials: 'omit', signal: AbortSignal.timeout(15000), headers: { 'X-Radar-Request': '1' },
  });
  if (response.status !== 200 || (response.url && new URL(response.url).origin !== config.baseURL)) {
    throw Error('Development preflight failed: expected a direct successful catalogue response.');
  }
  const data = await response.json();
  if (data?.sandbox !== true || !Array.isArray(data?.items)) throw Error('Development preflight refused: Stripe sandbox was not positively confirmed.');
}
