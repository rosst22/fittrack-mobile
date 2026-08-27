// Renders legal/*.md into standalone HTML pages for hosting.
//
// Deliberately dependency-free and deliberately not a general Markdown parser —
// it handles exactly the subset the two legal documents use (headings, bold,
// links, bullets, tables, rules, inline code). A legal page that must stay
// readable for years is not worth a dependency that can rot.
//
// Usage: node scripts/build-legal-html.mjs <out-dir>
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = process.argv[2] || join(root, 'dist-legal');

const escapeHtml = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Bold, inline code, and links — applied after escaping. */
function inline(text) {
  return escapeHtml(text)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
    .replace(/&lt;(https?:\/\/[^&\s]+)&gt;/g, '<a href="$1">$1</a>');
}

function mdToHtml(md) {
  const lines = md.split('\n');
  const out = [];
  let i = 0;
  let inList = false;

  const closeList = () => {
    if (inList) {
      out.push('</ul>');
      inList = false;
    }
  };

  while (i < lines.length) {
    const line = lines[i];
    const t = line.trim();

    if (t === '') {
      closeList();
      i++;
      continue;
    }

    // Horizontal rule (but not a table separator, handled below)
    if (/^-{3,}$/.test(t)) {
      closeList();
      out.push('<hr>');
      i++;
      continue;
    }

    // Table: a header row followed by a |---|---| separator
    if (t.startsWith('|') && /^\|[\s:|-]+\|$/.test((lines[i + 1] ?? '').trim())) {
      closeList();
      const cells = (row) =>
        row
          .trim()
          .split('|')
          .slice(1, -1)
          .map((c) => c.trim());
      const head = cells(t);
      i += 2;
      const body = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        body.push(cells(lines[i]));
        i++;
      }
      out.push('<div class="table-wrap"><table>');
      if (head.some(Boolean)) {
        out.push('<thead><tr>' + head.map((c) => `<th>${inline(c)}</th>`).join('') + '</tr></thead>');
      }
      out.push('<tbody>');
      for (const row of body) {
        out.push('<tr>' + row.map((c) => `<td>${inline(c)}</td>`).join('') + '</tr>');
      }
      out.push('</tbody></table></div>');
      continue;
    }

    const heading = t.match(/^(#{1,4})\s+(.*)$/);
    if (heading) {
      closeList();
      const level = heading[1].length;
      out.push(`<h${level}>${inline(heading[2])}</h${level}>`);
      i++;
      continue;
    }

    if (t.startsWith('- ')) {
      if (!inList) {
        out.push('<ul>');
        inList = true;
      }
      out.push(`<li>${inline(t.slice(2))}</li>`);
      i++;
      continue;
    }

    // Paragraph: gather until a blank line or a block-level construct
    closeList();
    const para = [t];
    i++;
    while (i < lines.length) {
      const n = lines[i].trim();
      if (n === '' || n.startsWith('#') || n.startsWith('- ') || n.startsWith('|') || /^-{3,}$/.test(n)) break;
      para.push(n);
      i++;
    }
    out.push(`<p>${inline(para.join(' '))}</p>`);
  }

  closeList();
  return out.join('\n');
}

const STYLE = `
:root {
  --bg: #ffffff; --fg: #1a1a1a; --muted: #5c5c5c;
  --rule: #e2e2e2; --accent: #16a34a; --code-bg: #f4f4f5;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #0d0d0d; --fg: #ededed; --muted: #a0a0a0;
    --rule: #262626; --accent: #22c55e; --code-bg: #1a1a1a;
  }
}
* { box-sizing: border-box; }
body {
  margin: 0; padding: 3rem 1.25rem 6rem;
  background: var(--bg); color: var(--fg);
  font: 16px/1.65 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  -webkit-text-size-adjust: 100%;
}
main { max-width: 45rem; margin: 0 auto; }
h1 { font-size: 2rem; line-height: 1.2; margin: 0 0 .5rem; letter-spacing: -.02em; }
h2 { font-size: 1.3rem; margin: 2.5rem 0 .75rem; letter-spacing: -.01em; }
h3 { font-size: 1.05rem; margin: 1.75rem 0 .5rem; }
p, li { color: var(--fg); }
ul { padding-left: 1.25rem; }
li { margin: .35rem 0; }
a { color: var(--accent); }
hr { border: 0; border-top: 1px solid var(--rule); margin: 2.5rem 0; }
code {
  background: var(--code-bg); padding: .12em .38em;
  border-radius: 4px; font-size: .9em;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
.table-wrap { overflow-x: auto; margin: 1rem 0; }
table { border-collapse: collapse; width: 100%; font-size: .95rem; }
th, td { text-align: left; padding: .55rem .7rem; border-bottom: 1px solid var(--rule); vertical-align: top; }
th { font-weight: 600; }
.back { display: inline-block; margin-bottom: 2rem; color: var(--muted); text-decoration: none; font-size: .9rem; }
.back:hover { color: var(--accent); }
footer { margin-top: 4rem; padding-top: 1.5rem; border-top: 1px solid var(--rule); color: var(--muted); font-size: .875rem; }
`;

function page({ title, bodyHtml, description }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(description)}">
<meta name="robots" content="index, follow">
<style>${STYLE}</style>
</head>
<body>
<main>
<a class="back" href="/">&larr; rosstoma.me</a>
${bodyHtml}
<footer>FitTrackAI &middot; <a href="/fittrack/privacy/">Privacy Policy</a> &middot; <a href="/fittrack/terms/">Terms of Use</a></footer>
</main>
</body>
</html>
`;
}

const docs = [
  {
    src: 'legal/privacy-policy.md',
    dir: 'privacy',
    title: 'FitTrackAI — Privacy Policy',
    description: 'How the FitTrackAI iOS app collects, uses and protects your data.',
  },
  {
    src: 'legal/terms-of-use.md',
    dir: 'terms',
    title: 'FitTrackAI — Terms of Use',
    description: 'Terms governing use of the FitTrackAI iOS app.',
  },
];

for (const d of docs) {
  const md = readFileSync(join(root, d.src), 'utf8');
  const html = page({ title: d.title, description: d.description, bodyHtml: mdToHtml(md) });
  const dest = join(outDir, d.dir);
  mkdirSync(dest, { recursive: true });
  writeFileSync(join(dest, 'index.html'), html);
  console.log(`wrote ${join(dest, 'index.html')} (${html.length} bytes)`);
}
