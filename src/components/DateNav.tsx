import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing } from '@/constants/theme';
import { prettyDate, shiftDate, todayStr } from '@/lib/day';

/** ‹ Wed, Aug 24 ›  — with a Today shortcut when you have navigated away. */
export function DateNav({
  date,
  onChange,
}: {
  date: string;
  onChange: (next: string) => void;
}) {
  const isToday = date === todayStr();
  return (
    <View style={styles.wrap}>
      <Pressable
        onPress={() => onChange(shiftDate(date, -1))}
        hitSlop={12}
        style={styles.arrow}
      >
        <Ionicons name="chevron-back" size={20} color={colors.text} />
      </Pressable>

      <Pressable onPress={() => onChange(todayStr())} style={styles.center}>
        <Text style={styles.label}>{isToday ? 'Today' : prettyDate(date)}</Text>
        {!isToday && <Text style={styles.hint}>tap for today</Text>}
      </Pressable>

      <Pressable
        onPress={() => onChange(shiftDate(date, 1))}
        hitSlop={12}
        // Logging into the future is almost always a mistake.
        disabled={isToday}
        style={[styles.arrow, isToday && { opacity: 0.3 }]}
      >
        <Ionicons name="chevron-forward" size={20} color={colors.text} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  arrow: { padding: spacing.sm },
  center: { alignItems: 'center', flex: 1 },
  label: { color: colors.text, fontSize: 16, fontWeight: '700' },
  hint: { color: colors.textMuted, fontSize: 11 },
});
