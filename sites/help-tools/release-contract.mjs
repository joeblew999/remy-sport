import { writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { contract, json } from './application.mjs';
const health = await json(process.argv[2] + '/api/health');
if (health.environment !== process.argv[4]) throw new Error('Deployed app reports the wrong environment');
const result = await contract(process.argv[2]);
const version = await json(result.base + '/api/versions');
await writeFile(process.argv[3] + '/contract.json', JSON.stringify({ origin: result.base, schemaPath: result.schemaPath, digest: createHash('sha256').update(JSON.stringify(result.spec)).digest('hex'), appVersion: version.current, checkedAt: new Date().toISOString() }, null, 2));
