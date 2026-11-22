import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { createHash } from 'node:crypto';
const root = 'D:/codex-tools/claswee-android';
fs.mkdirSync(root, { recursive: true });
async function download(url, name, expected) {
  const target = path.join(root, name);
  if (fs.existsSync(target)) return;
  console.log(`Downloading ${name}`);
  const response = await fetch(url, { signal: AbortSignal.timeout(600000) });
  if (!response.ok) throw new Error(`${name}: HTTP ${response.status}`);
  await pipeline(Readable.fromWeb(response.body), fs.createWriteStream(target + '.partial'));
  if (expected) {
    const hash = createHash('sha256');
    for await (const chunk of fs.createReadStream(target + '.partial')) hash.update(chunk);
    if (hash.digest('hex') !== expected) throw new Error(`Checksum mismatch: ${name}`);
  }
  fs.renameSync(target + '.partial', target);
  console.log(`Downloaded ${name}`);
}
const releases = await (await fetch('https://api.adoptium.net/v3/assets/latest/21/hotspot?architecture=x64&image_type=jdk&os=windows')).json();
const jdk = releases[0].binary.package;
await Promise.all([
  download(jdk.link, 'jdk21.zip', jdk.checksum),
  download('https://dl.google.com/android/repository/commandlinetools-win-13114758_latest.zip', 'android-cli.zip'),
]);
fs.writeFileSync(path.join(root, 'sources.json'), JSON.stringify({ jdk: { url: jdk.link, sha256: jdk.checksum }, androidCommandLineTools: 'https://dl.google.com/android/repository/commandlinetools-win-13114758_latest.zip' }, null, 2));
