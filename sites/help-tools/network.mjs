import https from 'node:https';
import { Readable } from 'node:stream';

const nativeFetch = globalThis.fetch;
const resolved = new Map();
/** Normal HTTPS first. On OS NXDOMAIN only, consult public DNS and retry the
 * same hostname with standard TLS/SNI verification. No hostfile, proxy, secret
 * environment override or disabled certificate checks. Shared release probes
 * use this explicitly because newly created domains can be negatively cached. */
export async function networkFetch(input, init) {
  try { return await nativeFetch(input, init); }
  catch (error) {
    if ((error.cause?.code ?? error.code) !== 'ENOTFOUND') throw error;
    const request = new Request(input, init);
    const url = new URL(request.url);
    if (url.protocol !== 'https:') throw error;
    let answer = resolved.get(url.hostname);
    if (!answer || answer.until < Date.now()) {
      const dns = await nativeFetch(`https://dns.google/resolve?name=${encodeURIComponent(url.hostname)}&type=A`, { signal: AbortSignal.timeout(10000) }).then(response => response.json());
      const addresses = dns.Status === 0 ? dns.Answer?.filter(item => item.type === 1 && /^\d+\.\d+\.\d+\.\d+$/.test(item.data)) : [];
      if (!addresses?.length) throw error;
      answer = { addresses, until: Date.now() + 30000 };
      resolved.set(url.hostname, answer);
      console.error(`docs: OS DNS missed ${url.hostname}; public DNS resolves it. Retrying the same HTTPS hostname with certificate verification.`);
    }
    const bytes = request.body ? Buffer.from(await request.arrayBuffer()) : undefined;
    return new Promise((resolve, reject) => {
      const outgoing = https.request(url, {
        method: request.method, headers: Object.fromEntries(request.headers), signal: request.signal,
        lookup(_hostname, options, callback) {
          const addresses = answer.addresses.map(item => ({ address: item.data, family: 4 }));
          if (options.all) callback(null, addresses); else callback(null, addresses[0].address, 4);
        },
      }, incoming => {
        const headers = new Headers();
        for (const [name, value] of Object.entries(incoming.headers)) if (value !== undefined) headers.set(name, Array.isArray(value) ? value.join(', ') : value);
        // Node https doesn't automatically decode response compression. This
        // path does not advertise Accept-Encoding, so public probes get identity.
        resolve(new Response([204, 304].includes(incoming.statusCode) ? null : Readable.toWeb(incoming), { status: incoming.statusCode, headers }));
      });
      outgoing.on('error', reject);
      outgoing.end(bytes);
    });
  }
}
