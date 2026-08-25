// Turns legal/*.md into a TypeScript module the app can import.
//
// Metro has no loader for .md, and adding a custom transformer for two static
// documents is not worth the build complexity. The markdown files stay the
// source of truth — they are what gets published to the web for the App Store
// listing's privacy policy URL — and this keeps the in-app copies identical.
//
// Run after editing either document:  npm run build:legal
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const read = (name) => readFileSync(join(root, 'legal', name), 'utf8');

const out = `// GENERATED FILE — do not edit.
// Source: legal/*.md. Regenerate with: npm run build:legal

export const PRIVACY_POLICY = ${JSON.stringify(read('privacy-policy.md'))};

export const TERMS_OF_USE = ${JSON.stringify(read('terms-of-use.md'))};
`;

mkdirSync(join(root, 'src', 'legal'), { recursive: true });
writeFileSync(join(root, 'src', 'legal', 'content.ts'), out);

console.log('Wrote src/legal/content.ts');
