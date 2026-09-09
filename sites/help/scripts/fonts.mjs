// Build-time, content-subset fonts for social images. No visitor font requests.
import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
const root = resolve(import.meta.dirname, '..');
const out = resolve(root, 'assets/fonts');
await mkdir(out, { recursive: true });
let stored = {};
try { stored = JSON.parse(await readFile(resolve(out, 'fonts.json'), 'utf8')); } catch {}
const files = await readdir(resolve(root, 'content'), { recursive: true });
for (const [locale, family, directory] of [['th', 'Noto Sans Thai', 'notosansthai'], ['ja', 'Noto Sans JP', 'notosansjp']]) {
  let text = Array.from({length:95},(_,i)=>String.fromCharCode(i+32)).join('');
  for (const path of files.filter(path => path.endsWith(`.${locale}.mdx`))) {
    const source = await readFile(resolve(root, 'content', path), 'utf8');
    text += [...source.matchAll(/^(?:title|description): (.+)$/gm)].map(match => match[1]).join('');
  }
  const characters = [...new Set(text)].sort().join('');
  if (stored[locale]?.characters === characters) continue;
  const url = new URL('https://fonts.googleapis.com/css2');
  url.searchParams.set('family', `${family}:wght@400`);
  url.searchParams.set('text', characters);
  const response = await fetch(url, { signal: AbortSignal.timeout(30000), headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!response.ok) throw new Error(`Font CSS failed: ${response.status}`);
  const css = await response.text();
  const urls = [...new Set([...css.matchAll(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/g)].map(match => match[1]))];
  if (!urls.length) throw new Error(`No font returned for ${family}`);
  const fonts = [];
  for (const url of urls) {
    const result = await fetch(url, { signal: AbortSignal.timeout(30000) });
    if (!result.ok) throw new Error(`Font download failed: ${result.status}`);
    fonts.push({ name: family, weight: 400, data: Buffer.from(await result.arrayBuffer()).toString('base64'), source: url });
  }
  const licenseURL = `https://raw.githubusercontent.com/google/fonts/main/ofl/${directory}/OFL.txt`;
  const license = await fetch(licenseURL, { signal: AbortSignal.timeout(30000) });
  if (!license.ok) throw new Error(`Font license failed: ${license.status}`);
  await writeFile(resolve(out, `${locale}-OFL.txt`), (await license.text()).replace(/[ \t]+$/gm, ''));
  stored[locale] = { family, characters, fonts, license: licenseURL };
  console.log(`docs: refreshed ${locale} social-image font subset (${characters.length} characters)`);
}
await writeFile(resolve(out, 'fonts.json'), JSON.stringify(stored));
