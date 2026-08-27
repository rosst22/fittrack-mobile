import { WorkoutForm } from '@/components/WorkoutForm';
import { Loading } from '@/components/ui';
import { getProfile } from '@/lib/queries';
import { useAsync } from '@/lib/useAsync';

export default function NewWorkoutScreen() {
  // Prefill bodyweight from the profile so the MET calorie estimate works
  // without retyping it every session.
  // A new account has no profile row, so `data` is legitimately null here —
  // gate on `loading`, not on whether data arrived.
  const { data, loading } = useAsync(() => getProfile(), []);
  if (loading) return <Loading />;
  return <WorkoutForm initialBodyweight={data?.weight_lb ?? null} />;
}
