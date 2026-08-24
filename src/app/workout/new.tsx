import { WorkoutForm } from '@/components/WorkoutForm';
import { Loading } from '@/components/ui';
import { getProfile } from '@/lib/queries';
import { useAsync } from '@/lib/useAsync';

export default function NewWorkoutScreen() {
  // Prefill bodyweight from the profile so the MET calorie estimate works
  // without retyping it every session.
  const { data, error } = useAsync(() => getProfile(), []);
  if (!data && !error) return <Loading />;
  return <WorkoutForm initialBodyweight={data?.weight_lb ?? null} />;
}
