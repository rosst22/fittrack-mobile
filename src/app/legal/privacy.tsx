import { LegalDoc } from '@/components/LegalDoc';
import { PRIVACY_POLICY } from '@/legal/content';

export default function PrivacyScreen() {
  return <LegalDoc source={PRIVACY_POLICY} />;
}
