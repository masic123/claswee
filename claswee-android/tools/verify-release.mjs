import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import yauzl from 'yauzl';
const project = process.cwd();
const releaseMode = process.argv.includes('--release');
const destination = process.argv.slice(2).find(arg => arg !== '--release');
const artifactSuffix = releaseMode ? '-release' : '';
const version = JSON.parse(fs.readFileSync('package.json', 'utf8')).version;
const versionCode = Number(fs.readFileSync('android/app/build.gradle', 'utf8').match(/versionCode\s+(\d+)/)[1]);
const apk = path.join(project, `artifacts/claswee-android-${version}${artifactSuffix}.apk`);
const toolchain = 'D:/codex-tools/claswee-android';
const staging = path.join(toolchain, 'release-check'); fs.mkdirSync(staging, { recursive: true });
const inspectedApk = path.join(staging, `claswee-android-${version}${artifactSuffix}.apk`); fs.copyFileSync(apk, inspectedApk);
const jdk = fs.readdirSync(path.join(toolchain, 'jdk')).find(name => fs.existsSync(path.join(toolchain, 'jdk', name, 'bin/java.exe')));
const sdkTools = path.join(toolchain, 'sdk/build-tools/36.0.0');
const run = (exe, args) => execFileSync(exe, args, { encoding: 'utf8', windowsHide: true });
const signature = run(path.join(toolchain, 'jdk', jdk, 'bin/java.exe'), ['-jar', path.join(sdkTools, 'lib/apksigner.jar'), 'verify', '--verbose', '--print-certs', inspectedApk]);
const badging = run(path.join(sdkTools, 'aapt.exe'), ['dump', 'badging', inspectedApk]);
const permissions = run(path.join(sdkTools, 'aapt.exe'), ['dump', 'permissions', inspectedApk]);
const alignment = run(path.join(sdkTools, 'zipalign.exe'), ['-c', '-P', '16', '4', inspectedApk]);
if (!badging.includes(`versionName='${version}'`) || !badging.includes(`versionCode='${versionCode}'`) || !badging.includes("name='com.claswee.schedule'")) throw new Error('APK identity/version mismatch');
if (releaseMode) {
  if (badging.includes('application-debuggable') || signature.includes('CN=Android Debug')) throw new Error('Release APK must not be debuggable or use the Android debug certificate');
  const signing = JSON.parse(fs.readFileSync(path.join(process.env.LOCALAPPDATA, 'claswee/android-signing/signing.json'), 'utf8'));
  const expectedCertificate = new crypto.X509Certificate(fs.readFileSync(signing.certificate));
  const fingerprint = expectedCertificate.fingerprint256.replaceAll(':', '').toLowerCase();
  if (!signature.includes(`certificate SHA-256 digest: ${fingerprint}`)) throw new Error('Unexpected release signer');
}
const page = await new Promise((resolve, reject) => {
  yauzl.open(apk, { lazyEntries: true }, (error, zip) => {
    if (error) return reject(error);
    zip.on('error', reject); zip.on('end', () => reject(new Error('APK index.html missing')));
    zip.on('entry', entry => {
      if (entry.fileName !== 'assets/public/index.html') return zip.readEntry();
      zip.openReadStream(entry, (error, stream) => {
        if (error) return reject(error);
        const parts = []; stream.on('data', part => parts.push(part)); stream.on('error', reject); stream.on('end', () => { zip.close(); resolve(Buffer.concat(parts).toString('utf8')); });
      });
    }); zip.readEntry();
  });
});
if (page !== fs.readFileSync('dist/index.html', 'utf8')) throw new Error('APK contains stale UI assets');
const digest = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
if (digest(inspectedApk) !== digest(apk)) throw new Error('Inspection copy checksum mismatch');
const sourceMap = JSON.parse(fs.readFileSync('artifacts/mini-ui-source-map.json', 'utf8'));
for (const [file, hash] of Object.entries(sourceMap.sha256)) if (digest(path.join(sourceMap.source, file)) !== hash) throw new Error(`Mini-program source changed: ${file}`);
let desktopFile;
if (destination) {
  desktopFile = path.join(destination, `claswee安卓版-${version}${artifactSuffix}.apk`);
  fs.copyFileSync(apk, desktopFile);
  if (digest(desktopFile) !== digest(apk)) throw new Error('Desktop copy checksum mismatch');
}
const result = { version, versionCode, buildType: releaseMode ? 'release' : 'debug', apk, desktopFile, bytes: fs.statSync(apk).size, sha256: digest(apk), signature, badging, permissions, zipAlignmentPassed: true, apkUsesLatestBuiltUi: true, miniProgramSourcesUnchanged: true, miniSourceFiles: Object.keys(sourceMap.sha256).length, realPhoneTested: false };
fs.writeFileSync(`artifacts/${releaseMode ? 'store-release-verification' : 'release-verification'}.json`, JSON.stringify(result, null, 2));
fs.writeFileSync(`artifacts/claswee-android-${version}${artifactSuffix}.apk.sha256`, `${result.sha256}  claswee-android-${version}${artifactSuffix}.apk\n`);
console.log(JSON.stringify({ version, bytes: result.bytes, sha256: result.sha256, signatureVerified: true, zipAlignmentPassed: true, apkUsesLatestBuiltUi: true, miniProgramSourcesUnchanged: true, desktopFile }, null, 2));
