// Shared primitives. Everything visual in the app is built from these so the
// screens stay about data, not about padding.
import { forwardRef, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';

import { colors, radius, spacing } from '@/constants/theme';

export function Card({
  children,
  style,
}: {
  children: ReactNode;
  style?: ViewStyle;
}) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return <Text style={styles.sectionLabel}>{children}</Text>;
}

export function Muted({ children, style }: { children: ReactNode; style?: object }) {
  return <Text style={[styles.muted, style]}>{children}</Text>;
}

export function Title({ children }: { children: ReactNode }) {
  return <Text style={styles.title}>{children}</Text>;
}

/** Big number + caption, the dashboard's basic unit. */
export function StatTile({
  value,
  label,
  sub,
  accent,
}: {
  value: string;
  label: string;
  sub?: string;
  accent?: boolean;
}) {
  return (
    <View style={styles.tile}>
      <Text style={[styles.tileValue, accent && { color: colors.accent }]}>{value}</Text>
      <Text style={styles.tileLabel}>{label}</Text>
      {sub ? <Text style={styles.tileSub}>{sub}</Text> : null}
    </View>
  );
}

export function Row({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[styles.row, style]}>{children}</View>;
}

/**
 * Progress toward a target. Fills green up to 100% and switches to amber past
 * it, because overshooting calories and overshooting protein mean opposite
 * things and the colour should not silently imply "good".
 */
export function ProgressBar({
  value,
  target,
  overIsBad = false,
}: {
  value: number;
  target: number | null | undefined;
  overIsBad?: boolean;
}) {
  if (!target || target <= 0) return null;
  const pct = Math.min(value / target, 1);
  const over = value > target;
  const barColor = over && overIsBad ? '#F59E0B' : colors.accent;
  return (
    <View style={styles.progressTrack}>
      <View
        style={[styles.progressFill, { width: `${pct * 100}%`, backgroundColor: barColor }]}
      />
    </View>
  );
}

export function GoalRow({
  label,
  value,
  target,
  unit,
  overIsBad,
}: {
  label: string;
  value: number;
  target: number | null | undefined;
  unit: string;
  overIsBad?: boolean;
}) {
  return (
    <View style={{ gap: spacing.xs }}>
      <Row>
        <Text style={styles.goalLabel}>{label}</Text>
        <Text style={styles.goalValue}>
          {Math.round(value).toLocaleString()}
          {target ? ` / ${Math.round(target).toLocaleString()}` : ''} {unit}
        </Text>
      </Row>
      <ProgressBar value={value} target={target} overIsBad={overIsBad} />
    </View>
  );
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  disabled,
  busy,
  style,
}: {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
  busy?: boolean;
  style?: ViewStyle;
}) {
  const isPrimary = variant === 'primary';
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || busy}
      style={({ pressed }) => [
        styles.button,
        isPrimary && styles.buttonPrimary,
        variant === 'secondary' && styles.buttonSecondary,
        variant === 'danger' && styles.buttonDanger,
        (disabled || busy) && styles.buttonDisabled,
        pressed && { opacity: 0.7 },
        style,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={isPrimary ? '#000' : colors.text} />
      ) : (
        <Text
          style={[
            styles.buttonText,
            isPrimary && { color: '#000' },
            variant === 'danger' && { color: colors.danger },
          ]}
        >
          {title}
        </Text>
      )}
    </Pressable>
  );
}

export const Input = forwardRef<TextInput, TextInputProps & { label?: string }>(
  function Input({ label, style, ...props }, ref) {
    return (
      <View style={{ gap: spacing.xs, flex: 1 }}>
        {label ? <Text style={styles.inputLabel}>{label}</Text> : null}
        <TextInput
          ref={ref}
          placeholderTextColor={colors.textMuted}
          style={[styles.input, style]}
          {...props}
        />
      </View>
    );
  }
);

export function EmptyState({ text }: { text: string }) {
  return (
    <View style={styles.empty}>
      <Text style={styles.muted}>{text}</Text>
    </View>
  );
}

export function Loading() {
  return (
    <View style={styles.empty}>
      <ActivityIndicator color={colors.accent} />
    </View>
  );
}

export function ErrorNote({ message }: { message: string }) {
  return (
    <View style={styles.errorBox}>
      <Text style={styles.errorText}>{message}</Text>
    </View>
  );
}

export function Chip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.chip, selected && { borderColor: colors.accent, backgroundColor: '#14301F' }]}
    >
      <Text style={[styles.chipText, selected && { color: colors.accent }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.sm,
  },
  sectionLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  title: { color: colors.text, fontSize: 22, fontWeight: '700' },
  muted: { color: colors.textMuted, fontSize: 15 },
  tile: { flex: 1, gap: 2 },
  tileValue: { color: colors.text, fontSize: 26, fontWeight: '700' },
  tileLabel: { color: colors.textMuted, fontSize: 13 },
  tileSub: { color: colors.textMuted, fontSize: 12, opacity: 0.8 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  progressTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.border,
    overflow: 'hidden',
  },
  progressFill: { height: '100%', borderRadius: 4 },
  goalLabel: { color: colors.text, fontSize: 15, fontWeight: '600' },
  goalValue: { color: colors.textMuted, fontSize: 14 },
  button: {
    borderRadius: radius.md,
    paddingVertical: 14,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonPrimary: { backgroundColor: colors.accent },
  buttonSecondary: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
  buttonDanger: { borderWidth: 1, borderColor: colors.danger },
  buttonDisabled: { opacity: 0.45 },
  buttonText: { color: colors.text, fontSize: 16, fontWeight: '700' },
  inputLabel: { color: colors.textMuted, fontSize: 13 },
  input: {
    backgroundColor: colors.bg,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    color: colors.text,
    fontSize: 16,
    padding: 12,
  },
  empty: { padding: spacing.lg, alignItems: 'center' },
  errorBox: {
    borderColor: colors.danger,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.sm,
    backgroundColor: '#2A1215',
  },
  errorText: { color: colors.danger, fontSize: 14 },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  chipText: { color: colors.textMuted, fontSize: 14, fontWeight: '600' },
});
