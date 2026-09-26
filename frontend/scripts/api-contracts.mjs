/** Generate or check TypeScript directly from the backend's OpenAPI document. */
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import openapiTS, { astToString } from 'openapi-typescript';

const backend = fileURLToPath(new URL('../../backend/', import.meta.url));
const output = new URL('../src/types/api.generated.ts', import.meta.url);
const exported = spawnSync(process.env.PYTHON || 'python', ['scripts/export_api_contracts.py'], {
  cwd: backend,
  // Schema export creates an engine but never opens a database connection.
  env: { ...process.env, ENVIRONMENT: 'test', DATABASE_URL: 'postgresql+psycopg://unused:unused@127.0.0.1:1/contracts', PYTHONPATH: backend },
  encoding: 'utf8',
  maxBuffer: 16 * 1024 * 1024,
});
if (exported.error) throw exported.error;
if (exported.status !== 0) throw new Error(exported.stderr || 'API schema export failed');
const ast = await openapiTS(JSON.parse(exported.stdout), { alphabetize: true, defaultNonNullable: false });
const generated = '// Generated from backend route schemas. Run npm run contracts:generate; do not edit.\n' + astToString(ast);
if (process.argv.includes('--check')) {
  if (readFileSync(output, 'utf8') !== generated) {
    console.error('API types are stale. Run npm run contracts:generate and commit the result.');
    process.exitCode = 1;
  }
} else {
  writeFileSync(output, generated);
}
