import { LegalDoc } from '@/components/LegalDoc';
import { TERMS_OF_USE } from '@/legal/content';

export default function TermsScreen() {
  return <LegalDoc source={TERMS_OF_USE} />;
}
