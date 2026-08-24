import { useLocalSearchParams } from 'expo-router';

import { WorkoutForm } from '@/components/WorkoutForm';
import { ErrorNote, Loading } from '@/components/ui';
import { getWorkout } from '@/lib/queries';
import { orderSets } from '@/lib/strength';
import { useAsync } from '@/lib/useAsync';

export default function EditWorkoutScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, error } = useAsync(() => getWorkout(id), [id]);

  if (error) return <ErrorNote message={error} />;
  if (!data) return <Loading />;

  return (
    <WorkoutForm
      workoutId={data.id}
      initialName={data.name}
      initialPerformedAt={data.performed_at}
      initialBodyweight={data.bodyweight_lb}
      initialExercises={(data.workout_exercises ?? []).map((ex) => ({
        name: ex.name,
        category: ex.category,
        duration_min: Number(ex.duration_min),
        calories: Number(ex.calories),
        sets: orderSets(ex.exercise_sets ?? []).map((s) => ({
          weight_lb: s.weight_lb == null ? null : Number(s.weight_lb),
          reps: s.reps == null ? null : Number(s.reps),
        })),
      }))}
    />
  );
}
