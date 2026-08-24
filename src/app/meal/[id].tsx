import { useLocalSearchParams } from 'expo-router';

import { MealForm } from '@/components/MealForm';
import { ErrorNote, Loading } from '@/components/ui';
import { getMeal } from '@/lib/queries';
import { useAsync } from '@/lib/useAsync';

export default function EditMealScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, error } = useAsync(() => getMeal(id), [id]);

  if (error) return <ErrorNote message={error} />;
  if (!data) return <Loading />;

  return (
    <MealForm
      mealId={data.id}
      initialName={data.name}
      initialEatenAt={data.eaten_at}
      initialIngredients={(data.meal_ingredients ?? []).map((i) => ({
        name: i.name,
        fdc_id: i.fdc_id,
        weight_g: Number(i.weight_g),
        calories: Number(i.calories),
        protein_g: Number(i.protein_g),
        carbs_g: Number(i.carbs_g),
        fat_g: Number(i.fat_g),
        micronutrients: i.micronutrients,
      }))}
    />
  );
}
