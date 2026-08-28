import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { Button, ErrorNote, Muted } from '@/components/ui';
import { colors, radius, spacing } from '@/constants/theme';
import { coachChat, QuotaError } from '@/lib/api';
import { useEntitlement } from '@/lib/entitlement';
import { showProUpsell } from '@/lib/purchases';

type Msg = { role: 'user' | 'assistant'; content: string };

const SUGGESTIONS = [
  'How am I doing against my goals today?',
  'What should I eat to hit my protein target?',
  'Was my workout enough today?',
];

export default function CoachScreen() {
  const { tier, limitFor, remainingFor, refresh } = useEntitlement();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsUpgrade, setNeedsUpgrade] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;

    const next: Msg[] = [...messages, { role: 'user', content: trimmed }];
    setMessages(next);
    setInput('');
    setBusy(true);
    setError(null);
    setNeedsUpgrade(false);

    try {
      // The whole conversation goes up each time — the Edge Function is
      // stateless, so history has to travel with the request.
      const res = await coachChat(next);
      setMessages([...next, { role: 'assistant', content: res.reply }]);
      await refresh();
    } catch (e) {
      if (e instanceof QuotaError) {
        setError(e.message);
        setNeedsUpgrade(e.upgrade);
        await refresh();
      } else {
        setError(e instanceof Error ? e.message : 'The coach is unavailable.');
      }
      // Drop the unanswered turn so retrying does not duplicate it.
      setMessages(messages);
      setInput(trimmed);
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={90}
    >
      <View style={styles.quota}>
        <Muted style={{ fontSize: 13 }}>
          {remainingFor('coach_chat')} of {limitFor('coach_chat')} messages left today
        </Muted>
        {tier === 'free' && showProUpsell() && (
          <Pressable onPress={() => router.push('/paywall')}>
            <Text style={styles.upgradeLink}>Get more</Text>
          </Pressable>
        )}
      </View>

      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.thread}
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
      >
        {messages.length === 0 && (
          <View style={styles.intro}>
            <Ionicons name="chatbubbles-outline" size={40} color={colors.accent} />
            <Text style={styles.introTitle}>Ask about your day</Text>
            <Muted style={{ textAlign: 'center' }}>
              The coach can see what you logged today — meals, workouts and goals — so you can ask
              directly rather than repeating it.
            </Muted>
            <View style={{ gap: spacing.sm, width: '100%', marginTop: spacing.md }}>
              {SUGGESTIONS.map((s) => (
                <Pressable key={s} style={styles.suggestion} onPress={() => send(s)}>
                  <Text style={styles.suggestionText}>{s}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        {messages.map((m, i) => (
          <View
            key={i}
            style={[styles.bubble, m.role === 'user' ? styles.userBubble : styles.coachBubble]}
          >
            <Text style={m.role === 'user' ? styles.userText : styles.coachText}>{m.content}</Text>
          </View>
        ))}

        {busy && (
          <View style={[styles.bubble, styles.coachBubble]}>
            <ActivityIndicator color={colors.accent} />
          </View>
        )}

        {error && <ErrorNote message={error} />}
        {needsUpgrade && showProUpsell() && (
          <Button title="See FitTrack.AI Pro" onPress={() => router.push('/paywall')} />
        )}
      </ScrollView>

      <View style={styles.composer}>
        <TextInput
          style={styles.input}
          value={input}
          onChangeText={setInput}
          placeholder="Ask the coach…"
          placeholderTextColor={colors.textMuted}
          multiline
          onSubmitEditing={() => send(input)}
        />
        <Pressable
          style={[styles.send, (!input.trim() || busy) && { opacity: 0.4 }]}
          onPress={() => send(input)}
          disabled={!input.trim() || busy}
        >
          <Ionicons name="arrow-up" size={22} color="#000" />
        </Pressable>
      </View>

      <Muted style={styles.disclaimer}>
        Not medical advice. Estimates can be wrong — check anything important.
      </Muted>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  quota: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  upgradeLink: { color: colors.accent, fontSize: 13, fontWeight: '700' },
  thread: { padding: spacing.md, gap: spacing.sm },
  intro: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xl },
  introTitle: { color: colors.text, fontSize: 20, fontWeight: '700' },
  suggestion: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  suggestionText: { color: colors.text, fontSize: 15 },
  bubble: { borderRadius: radius.lg, padding: spacing.md, maxWidth: '88%' },
  userBubble: { backgroundColor: colors.accent, alignSelf: 'flex-end' },
  coachBubble: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    alignSelf: 'flex-start',
  },
  userText: { color: '#000', fontSize: 15, fontWeight: '500' },
  coachText: { color: colors.text, fontSize: 15, lineHeight: 21 },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
  input: {
    flex: 1,
    maxHeight: 120,
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.lg,
    color: colors.text,
    fontSize: 16,
    padding: 12,
  },
  send: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disclaimer: { fontSize: 11, textAlign: 'center', paddingVertical: spacing.sm },
});
