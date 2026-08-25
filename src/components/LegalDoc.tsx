import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { colors, spacing } from '@/constants/theme';

/**
 * Renders the legal documents from a small subset of Markdown.
 *
 * The documents are bundled with the app rather than fetched, so they are
 * readable offline and cannot change under the user without a new release —
 * which is what "we will notify you before the change takes effect" requires.
 * A full Markdown renderer would be a dependency for four syntax features.
 */
export function LegalDoc({ source }: { source: string }) {
  const lines = source.split('\n');
  const out: React.ReactNode[] = [];
  let key = 0;

  for (const raw of lines) {
    const line = raw.trimEnd();

    if (line.trim() === '' || line.trim() === '---') continue;

    // Tables render as plain rows; the separator line is noise.
    if (/^\|[\s:|-]+\|$/.test(line.trim())) continue;

    if (line.startsWith('# ')) {
      out.push(
        <Text key={key++} style={styles.h1}>
          {inline(line.slice(2))}
        </Text>
      );
    } else if (line.startsWith('## ')) {
      out.push(
        <Text key={key++} style={styles.h2}>
          {inline(line.slice(3))}
        </Text>
      );
    } else if (line.startsWith('### ')) {
      out.push(
        <Text key={key++} style={styles.h3}>
          {inline(line.slice(4))}
        </Text>
      );
    } else if (line.trim().startsWith('|')) {
      const cells = line
        .split('|')
        .slice(1, -1)
        .map((c) => c.trim());
      out.push(
        <View key={key++} style={styles.tableRow}>
          {cells.map((c, i) => (
            <Text key={i} style={[styles.body, styles.cell, i === 0 && styles.cellFirst]}>
              {inline(c)}
            </Text>
          ))}
        </View>
      );
    } else if (line.startsWith('- ')) {
      out.push(
        <View key={key++} style={styles.bullet}>
          <Text style={styles.body}>{'•'}</Text>
          <Text style={[styles.body, { flex: 1 }]}>{inline(line.slice(2))}</Text>
        </View>
      );
    } else {
      out.push(
        <Text key={key++} style={styles.body}>
          {inline(line)}
        </Text>
      );
    }
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      {out}
      <View style={{ height: spacing.xl }} />
    </ScrollView>
  );
}

/** Handles **bold** and strips link syntax, keeping the URL readable. */
function inline(text: string): React.ReactNode {
  const cleaned = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)').replace(/<|>/g, '');
  const parts = cleaned.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
  return parts.map((p, i) =>
    p.startsWith('**') && p.endsWith('**') ? (
      <Text key={i} style={styles.bold}>
        {p.slice(2, -2)}
      </Text>
    ) : (
      p
    )
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.md, gap: spacing.sm },
  h1: { color: colors.text, fontSize: 24, fontWeight: '800', marginBottom: spacing.xs },
  h2: { color: colors.accent, fontSize: 18, fontWeight: '700', marginTop: spacing.md },
  h3: { color: colors.text, fontSize: 16, fontWeight: '700', marginTop: spacing.sm },
  body: { color: colors.textMuted, fontSize: 15, lineHeight: 22 },
  bold: { color: colors.text, fontWeight: '700' },
  bullet: { flexDirection: 'row', gap: spacing.sm, paddingLeft: spacing.xs },
  tableRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  cell: { flex: 1, fontSize: 13 },
  cellFirst: { color: colors.text, fontWeight: '600' },
});
