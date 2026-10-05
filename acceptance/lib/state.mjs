import { mkdirSync, readFileSync, writeFileSync, renameSync, existsSync, openSync, closeSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { root } from './config.mjs';

export const localDir = path.join(root, '.local');
export function statePath(role) {
  if (!['user', 'admin'].includes(role)) throw Error('Unsupported acceptance account role.');
  return path.join(localDir, `${role}.json`);
}
export function expectedEmail(config, role) { return role === 'admin' ? config.adminEmail : config.userEmail; }
export function verifyIdentity(user, config, role) {
  if (!user || user.email?.toLowerCase() !== expectedEmail(config, role) || user.role !== role ||
      user.is_super_admin !== false || user.is_active !== true) {
    throw Error('Wrong acceptance identity/role, inactive account or super-admin. Sign in with the dedicated account.');
  }
  return user;
}
export function readState(config, role) {
  const p = statePath(role);
  if (!existsSync(p)) throw Error(`No ${role} browser session. Run npm run auth -- --role=${role} first.`);
  const value = JSON.parse(readFileSync(p, 'utf8'));
  if (value.origin !== config.baseURL) throw Error('Saved browser session belongs to another origin; authenticate again.');
  verifyIdentity(value.user, config, role);
  if (!Array.isArray(value.storage?.cookies) || !Array.isArray(value.storage?.origins)) throw Error('Invalid saved browser session. Authenticate again.');
  return value;
}
export function writeState(config, role, user, storage) {
  verifyIdentity(user, config, role);
  mkdirSync(localDir, { recursive: true, mode: 0o700 });
  const p = statePath(role), temp = `${p}.${process.pid}.tmp`;
  writeFileSync(temp, JSON.stringify({ origin: config.baseURL, user, storage }), { mode: 0o600 });
  renameSync(temp, p);
}
/** One operator run at a time. Never delete an unknown or stale process's lock. */
export function acquireLock() {
  mkdirSync(localDir, { recursive: true, mode: 0o700 });
  const p = path.join(localDir, 'run.lock');
  let fd;
  try { fd = openSync(p, 'wx', 0o600); }
  catch { throw Error('An acceptance run is already locked. Stop other runs; inspect .local/run.lock before removing a stale lock.'); }
  writeFileSync(fd, `${process.pid}\n`); closeSync(fd);
  return () => { try { unlinkSync(p); } catch {} };
}
