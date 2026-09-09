import { networkFetch } from './network.mjs';
const response = await networkFetch(process.argv[2] + '/health', { signal: AbortSignal.timeout(15000) });
if (!response.ok) throw new Error(`Help status ${response.status}`);
console.log(JSON.stringify(await response.json()));
