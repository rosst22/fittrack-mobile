// App Store Connect API client — pushes the listing and screenshots.
//
// Dependency-free on purpose. The only hard part is the JWT: App Store Connect
// wants ES256 with a JOSE-style signature (raw r||s), not the DER encoding
// Node emits by default. `dsaEncoding: 'ieee-p1363'` is what switches that.
//
// Credentials come from the environment and are never printed:
//   ASC_KEY_ID     e.g. 2X9ABC3DEF
//   ASC_ISSUER_ID  e.g. 69a6de70-....
//   ASC_KEY_PATH   path to the downloaded AuthKey_XXXX.p8
//
// Usage:
//   node scripts/appstore/asc.mjs apps                 list apps + their ids
//   node scripts/appstore/asc.mjs metadata <appId>     push name/subtitle/description
//   node scripts/appstore/asc.mjs screenshots <appId>  upload ~/Desktop/fittrackai-appstore
//   node scripts/appstore/asc.mjs status <appId>       where the version stands
import { createSign } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

const KEY_ID = process.env.ASC_KEY_ID;
const ISSUER_ID = process.env.ASC_ISSUER_ID;
const KEY_PATH = process.env.ASC_KEY_PATH;

if (!KEY_ID || !ISSUER_ID || !KEY_PATH) {
  console.error(
    'Missing credentials. Set ASC_KEY_ID, ASC_ISSUER_ID and ASC_KEY_PATH.\n' +
      'Generate a key at App Store Connect -> Users and Access -> Integrations.',
  );
  process.exit(1);
}

const b64url = (buf) =>
  Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

function token() {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'ES256', kid: KEY_ID, typ: 'JWT' };
  // 20 minutes is the maximum App Store Connect accepts.
  const payload = { iss: ISSUER_ID, iat: now, exp: now + 1200, aud: 'appstoreconnect-v1' };
  const body = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  const signer = createSign('SHA256');
  signer.update(body);
  const sig = signer.sign({ key: readFileSync(KEY_PATH), dsaEncoding: 'ieee-p1363' });
  return `${body}.${b64url(sig)}`;
}

const BASE = 'https://api.appstoreconnect.apple.com/v1';

async function api(path, { method = 'GET', body, raw } = {}) {
  const url = path.startsWith('http') ? path : `${BASE}${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token()}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (raw) return res;
  const text = await res.text();
  if (!res.ok) {
    // Apple's errors are genuinely informative; surface them whole.
    throw new Error(`${method} ${path} -> ${res.status}\n${text}`);
  }
  return text ? JSON.parse(text) : null;
}

// ---------------------------------------------------------------- commands

async function apps() {
  const { data } = await api('/apps?limit=50');
  for (const a of data) {
    console.log(`${a.id}  ${a.attributes.bundleId.padEnd(28)} ${a.attributes.name}`);
  }
  if (!data.length) console.log('No apps found for this key.');
}

/** The editable version — the one not yet released. */
async function editableVersion(appId) {
  const { data } = await api(
    `/apps/${appId}/appStoreVersions?limit=10&fields[appStoreVersions]=versionString,appStoreState,platform`,
  );
  const editable = data.find(
    (v) =>
      v.attributes.platform === 'IOS' &&
      !['READY_FOR_SALE', 'REPLACED_WITH_NEW_VERSION'].includes(v.attributes.appStoreState),
  );
  if (!editable) throw new Error('No editable iOS version found. Create version 1.0.0 first.');
  return editable;
}

async function localization(versionId, locale = 'en-US') {
  const { data } = await api(`/appStoreVersions/${versionId}/appStoreVersionLocalizations?limit=50`);
  const loc = data.find((l) => l.attributes.locale === locale);
  if (!loc) throw new Error(`No ${locale} localization on this version.`);
  return loc;
}

const LISTING = {
  description: readFileSync(new URL('./description.txt', import.meta.url), 'utf8').trim(),
  keywords:
    'calorie,macro,nutrition,food,diet,gym,workout,strength,protein,tracker,fitness,weight,ai,scanner',
  promotionalText:
    'Point your camera at any meal and get the macros in seconds. Per-set strength logging, ' +
    '14-day trends, and a coach that actually reads your data.',
  supportUrl: 'https://rosstoma.me/fittrack/privacy',
  marketingUrl: null,
  whatsNew: null, // first release — Apple rejects this field on 1.0
};

async function metadata(appId) {
  const version = await editableVersion(appId);
  const loc = await localization(version.id);

  await api(`/appStoreVersionLocalizations/${loc.id}`, {
    method: 'PATCH',
    body: {
      data: {
        type: 'appStoreVersionLocalizations',
        id: loc.id,
        attributes: Object.fromEntries(
          Object.entries(LISTING).filter(([, v]) => v !== null),
        ),
      },
    },
  });
  console.log(`✓ description, keywords, promo text -> version ${version.attributes.versionString}`);

  // Name and subtitle live on the app-level localization, not the version's.
  const { data: appLocs } = await api(`/apps/${appId}/appInfos`);
  const infoId = appLocs[0].id;
  const { data: infoLocs } = await api(`/appInfos/${infoId}/appInfoLocalizations?limit=50`);
  const enus = infoLocs.find((l) => l.attributes.locale === 'en-US');
  if (enus) {
    await api(`/appInfoLocalizations/${enus.id}`, {
      method: 'PATCH',
      body: {
        data: {
          type: 'appInfoLocalizations',
          id: enus.id,
          attributes: {
            name: 'FitTrack.AI: Meal & Lift Log',
            subtitle: 'Snap a meal, log your lifts',
            privacyPolicyUrl: 'https://rosstoma.me/fittrack/privacy',
          },
        },
      },
    });
    console.log('✓ name, subtitle, privacy policy URL');
  }
}

const DISPLAY_TYPE = 'APP_IPHONE_67'; // 6.7"/6.9" — 1290x2796. Covers all iPhones now.

async function screenshots(appId, dir = `${process.env.HOME}/Desktop/fittrackai-appstore`) {
  const version = await editableVersion(appId);
  const loc = await localization(version.id);

  const { data: sets } = await api(
    `/appStoreVersionLocalizations/${loc.id}/appScreenshotSets?limit=50`,
  );
  let set = sets.find((s) => s.attributes.screenshotDisplayType === DISPLAY_TYPE);

  if (set) {
    // Replace rather than append — reruns should be idempotent.
    const { data: existing } = await api(`/appScreenshotSets/${set.id}/appScreenshots?limit=50`);
    for (const s of existing) {
      await api(`/appScreenshots/${s.id}`, { method: 'DELETE', raw: true });
    }
    if (existing.length) console.log(`  cleared ${existing.length} existing screenshot(s)`);
  } else {
    ({ data: set } = await api('/appScreenshotSets', {
      method: 'POST',
      body: {
        data: {
          type: 'appScreenshotSets',
          attributes: { screenshotDisplayType: DISPLAY_TYPE },
          relationships: {
            appStoreVersionLocalization: {
              data: { type: 'appStoreVersionLocalizations', id: loc.id },
            },
          },
        },
      },
    }));
    console.log('  created screenshot set');
  }

  const files = readdirSync(dir)
    .filter((f) => /\.(png|jpg|jpeg)$/i.test(f))
    .sort();
  if (!files.length) throw new Error(`No images in ${dir}`);

  for (const name of files) {
    const bytes = readFileSync(join(dir, name));

    // 1. Reserve — Apple replies with the URLs to PUT the bytes to.
    const { data: shot } = await api('/appScreenshots', {
      method: 'POST',
      body: {
        data: {
          type: 'appScreenshots',
          attributes: { fileName: name, fileSize: bytes.length },
          relationships: {
            appScreenshotSet: { data: { type: 'appScreenshotSets', id: set.id } },
          },
        },
      },
    });

    // 2. Upload each part it asked for.
    for (const op of shot.attributes.uploadOperations) {
      const headers = Object.fromEntries(op.requestHeaders.map((h) => [h.name, h.value]));
      const chunk = bytes.subarray(op.offset, op.offset + op.length);
      const put = await fetch(op.url, { method: op.method, headers, body: chunk });
      if (!put.ok) throw new Error(`upload ${name} -> ${put.status} ${await put.text()}`);
    }

    // 3. Commit with the checksum so Apple can verify what landed.
    await api(`/appScreenshots/${shot.id}`, {
      method: 'PATCH',
      body: {
        data: {
          type: 'appScreenshots',
          id: shot.id,
          attributes: { uploaded: true, sourceFileChecksum: createHash('md5').update(bytes).digest('hex') },
        },
      },
    });
    console.log(`  ✓ ${name}`);
  }
  console.log(`✓ ${files.length} screenshots uploaded`);
}

async function status(appId) {
  const version = await editableVersion(appId);
  console.log(`version ${version.attributes.versionString}: ${version.attributes.appStoreState}`);

  const loc = await localization(version.id);
  const a = loc.attributes;
  const mark = (v) => (v ? '✓' : '·');
  console.log(`${mark(a.description)} description   ${mark(a.keywords)} keywords   ${mark(a.promotionalText)} promo text`);

  const { data: sets } = await api(
    `/appStoreVersionLocalizations/${loc.id}/appScreenshotSets?limit=50`,
  );
  for (const s of sets) {
    const { data: shots } = await api(`/appScreenshotSets/${s.id}/appScreenshots?limit=50`);
    console.log(`${mark(shots.length)} ${s.attributes.screenshotDisplayType}: ${shots.length} screenshot(s)`);
  }

  const { data: builds } = await api(`/apps/${appId}/builds?limit=5`);
  console.log(`${mark(builds.length)} builds uploaded: ${builds.length}`);
  for (const b of builds) {
    console.log(`    ${b.attributes.version} — ${b.attributes.processingState}`);
  }
}

// ---------------------------------------------------------------- dispatch

const [cmd, ...args] = process.argv.slice(2);
const commands = { apps, metadata, screenshots, status };

if (!commands[cmd]) {
  console.error(`Usage: node scripts/appstore/asc.mjs <${Object.keys(commands).join('|')}> [appId]`);
  process.exit(1);
}

try {
  await commands[cmd](...args);
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
