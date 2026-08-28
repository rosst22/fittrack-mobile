import Ionicons from '@expo/vector-icons/Ionicons';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useState } from 'react';
import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Card, ErrorNote, Input, Muted, Row, SectionLabel } from '@/components/ui';
import { colors, radius, spacing } from '@/constants/theme';
import { analyzeMeal, QuotaError, type AnalyzedIngredient } from '@/lib/api';
import { useEntitlement } from '@/lib/entitlement';
import type { NewIngredient } from '@/lib/queries';

/**
 * Longest edge, in pixels, that we send to the model.
 *
 * Re-encoding at this size does three useful things at once: it keeps the
 * request small and cheap, it guarantees the file is a real JPEG (the encoder
 * produces one regardless of what came in), and — the part that matters for
 * privacy — it DROPS ALL EXIF, including the GPS coordinates iPhones embed in
 * photos. Sending a health-app photo with the user's home location attached
 * would be a genuine leak, so this resize is not just an optimisation.
 */
const MAX_EDGE = 1280;
const JPEG_QUALITY = 0.7;

export function PhotoScanner({
  visible,
  onClose,
  onResult,
}: {
  visible: boolean;
  onClose: () => void;
  onResult: (mealName: string, ingredients: NewIngredient[]) => void;
}) {
  const { tier, limitFor, remainingFor, refresh } = useEntitlement();
  const [preview, setPreview] = useState<string | null>(null);
  const [base64, setBase64] = useState<string | null>(null);
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsUpgrade, setNeedsUpgrade] = useState(false);

  const remaining = remainingFor('photo_meal');

  function reset() {
    setPreview(null);
    setBase64(null);
    setDescription('');
    setError(null);
    setNeedsUpgrade(false);
  }

  async function pick(source: 'camera' | 'library') {
    setError(null);
    setNeedsUpgrade(false);

    const permission =
      source === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      setError(
        source === 'camera'
          ? 'Camera access is off. Turn it on in Settings → FitTrack.AI.'
          : 'Photo access is off. Turn it on in Settings → FitTrack.AI.'
      );
      return;
    }

    const result =
      source === 'camera'
        ? await ImagePicker.launchCameraAsync({ quality: 1, exif: false })
        : await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            quality: 1,
            exif: false,
          });

    if (result.canceled || !result.assets[0]) return;

    try {
      // Re-encode before the image ever leaves the device. See MAX_EDGE above.
      const context = ImageManipulator.ImageManipulator.manipulate(result.assets[0].uri);
      context.resize({ width: MAX_EDGE });
      const rendered = await context.renderAsync();
      const saved = await rendered.saveAsync({
        compress: JPEG_QUALITY,
        format: ImageManipulator.SaveFormat.JPEG,
        base64: true,
      });

      if (!saved.base64) {
        setError('Could not read that image. Try another one.');
        return;
      }
      setPreview(saved.uri);
      setBase64(saved.base64);
    } catch {
      setError('Could not process that image. Try another one.');
    }
  }

  async function analyze() {
    if (!base64 && !description.trim()) {
      setError('Take a photo or describe the meal.');
      return;
    }
    setBusy(true);
    setError(null);
    setNeedsUpgrade(false);
    try {
      const res = await analyzeMeal({
        image: base64 ?? undefined,
        description: description.trim() || undefined,
      });
      await refresh();

      if (!res.ingredients || res.ingredients.length === 0) {
        setError('No food was found in that. Try a clearer photo, or describe the meal.');
        return;
      }

      onResult(res.meal_name, res.ingredients.map(toIngredient));
      reset();
      onClose();
    } catch (e) {
      if (e instanceof QuotaError) {
        setError(e.message);
        setNeedsUpgrade(e.upgrade);
        await refresh();
      } else {
        setError(e instanceof Error ? e.message : 'Could not analyze that.');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.modal}>
        <Row style={styles.header}>
          <Text style={styles.headerTitle}>Scan a meal</Text>
          <Pressable
            onPress={() => {
              reset();
              onClose();
            }}
            hitSlop={12}
          >
            <Ionicons name="close" size={26} color={colors.text} />
          </Pressable>
        </Row>

        <ScrollView contentContainerStyle={styles.content}>
          <Row style={styles.quota}>
            <Muted style={{ fontSize: 13 }}>
              {remaining} of {limitFor('photo_meal')} scans left today
            </Muted>
            {tier === 'free' && (
              <Pressable onPress={() => router.push('/paywall')}>
                <Text style={styles.upgradeLink}>Get more</Text>
              </Pressable>
            )}
          </Row>

          {error && <ErrorNote message={error} />}
          {needsUpgrade && (
            <Button title="See FitTrack.AI Pro" onPress={() => router.push('/paywall')} />
          )}

          {preview ? (
            <View style={styles.previewWrap}>
              <Image source={{ uri: preview }} style={styles.preview} resizeMode="cover" />
              <Pressable style={styles.clearPhoto} onPress={() => { setPreview(null); setBase64(null); }}>
                <Ionicons name="close-circle" size={28} color="#fff" />
              </Pressable>
            </View>
          ) : (
            <Row style={{ gap: spacing.sm }}>
              <Pressable style={styles.sourceBtn} onPress={() => pick('camera')}>
                <Ionicons name="camera" size={26} color={colors.accent} />
                <Text style={styles.sourceText}>Take photo</Text>
              </Pressable>
              <Pressable style={styles.sourceBtn} onPress={() => pick('library')}>
                <Ionicons name="images" size={26} color={colors.accent} />
                <Text style={styles.sourceText}>Choose photo</Text>
              </Pressable>
            </Row>
          )}

          <Card>
            <SectionLabel>Notes (optional)</SectionLabel>
            <Input
              value={description}
              onChangeText={setDescription}
              placeholder="e.g. I only ate half of it"
              multiline
              style={{ minHeight: 70, textAlignVertical: 'top' }}
            />
            <Muted style={{ fontSize: 12 }}>
              Your notes override the photo where they disagree. You can also describe a meal with
              no photo at all — that uses a separate, larger allowance.
            </Muted>
          </Card>

          <Button
            title={busy ? 'Analyzing…' : 'Estimate nutrition'}
            onPress={analyze}
            busy={busy}
            disabled={!base64 && !description.trim()}
          />

          <Muted style={{ fontSize: 12 }}>
            Photos are resized on your phone before being sent, which also strips location data.
            Estimates are approximate — check them before saving.
          </Muted>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

function toIngredient(i: AnalyzedIngredient): NewIngredient {
  return {
    name: i.name,
    fdc_id: null,
    weight_g: Number(i.grams) || 0,
    calories: Number(i.calories) || 0,
    protein_g: Number(i.protein_g) || 0,
    carbs_g: Number(i.carbs_g) || 0,
    fat_g: Number(i.fat_g) || 0,
    // Keys must match TRACKED_MICROS in micros.ts, or the dashboard totals
    // silently stay at zero.
    micronutrients: {
      Fiber: { amount: Number(i.fiber_g) || 0, unit: 'g' },
      Sodium: { amount: Number(i.sodium_mg) || 0, unit: 'mg' },
      Potassium: { amount: Number(i.potassium_mg) || 0, unit: 'mg' },
      Cholesterol: { amount: Number(i.cholesterol_mg) || 0, unit: 'mg' },
    },
  };
}

const styles = StyleSheet.create({
  modal: { flex: 1, backgroundColor: colors.bg },
  header: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  headerTitle: { color: colors.text, fontSize: 20, fontWeight: '700' },
  content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xl },
  quota: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
  },
  upgradeLink: { color: colors.accent, fontSize: 13, fontWeight: '700' },
  sourceBtn: {
    flex: 1,
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingVertical: spacing.lg,
  },
  sourceText: { color: colors.text, fontSize: 15, fontWeight: '600' },
  previewWrap: { position: 'relative', borderRadius: radius.lg, overflow: 'hidden' },
  preview: { width: '100%', height: 240, backgroundColor: colors.card },
  clearPhoto: { position: 'absolute', top: spacing.sm, right: spacing.sm },
});
