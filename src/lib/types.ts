// Row shapes, hand-mirrored from meal-tracker/supabase/schema.sql.
//
// These are written by hand rather than generated because generating them needs
// the Supabase CLI logged into the project, and Ross owns the credentials. If
// the schema ever drifts from this file, regenerate with:
//   npx supabase gen types typescript --project-id kzzjdbdzpqqznslkhiky > src/lib/types.ts
//
// `numeric` columns come back from PostgREST as JS numbers here because the
// values are small; do not add a numeric column holding money or a huge integer
// without checking that it survives the round trip.

export type Profile = {
  id: string;
  height_in: number | null;
  age: number | null;
  weight_lb: number | null;
  sex: 'male' | 'female' | null;
  updated_at: string;
};

export type Goals = {
  id: string;
  calorie_target: number | null;
  protein_target_g: number | null;
  carbs_target_g: number | null;
  fat_target_g: number | null;
  workouts_per_week: number | null;
  water_target_oz: number | null;
  notes: string | null;
  updated_at: string;
};

/**
 * Stored keyed by the display label used in micros.ts (`"Fiber"`, `"Sodium"`,
 * …), each holding an amount plus its unit — not flat `fiber_g` numbers. Read
 * it with addMicros() from micros.ts rather than indexing it directly, so the
 * mobile app and the web app agree on the key names.
 */
export type Micronutrients = Record<string, { amount: number; unit: string }>;

export type MealIngredient = {
  id: string;
  meal_id: string;
  fdc_id: number | null;
  name: string;
  weight_g: number;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  micronutrients: Micronutrients;
  created_at: string;
};

export type Meal = {
  id: string;
  user_id: string;
  name: string;
  eaten_at: string;
  created_at: string;
  photo_path: string | null;
  is_favorite: boolean;
};

export type MealWithIngredients = Meal & {
  meal_ingredients: MealIngredient[];
};

export type ExerciseSet = {
  id: string;
  workout_exercise_id: string;
  set_index: number;
  weight_lb: number | null;
  reps: number | null;
  created_at: string;
};

export type WorkoutExercise = {
  id: string;
  workout_id: string;
  name: string;
  category: string;
  met: number;
  duration_min: number;
  calories: number;
  created_at: string;
  exercise_sets: ExerciseSet[];
};

export type Workout = {
  id: string;
  user_id: string;
  name: string;
  bodyweight_lb: number | null;
  performed_at: string;
  created_at: string;
  source: 'manual' | 'whoop';
  whoop_workout_id: string | null;
};

export type WorkoutWithExercises = Workout & {
  workout_exercises: WorkoutExercise[];
};

export type WaterLog = {
  id: string;
  user_id: string;
  amount_oz: number;
  logged_at: string;
};

export type Supplement = {
  id: string;
  user_id: string;
  name: string;
  dose: string | null;
  category: 'supplement' | 'medication';
  active: boolean;
  created_at: string;
};

export type Habit = {
  id: string;
  user_id: string;
  name: string;
  active: boolean;
  created_at: string;
};

export type FoodLibraryItem = {
  id: string;
  user_id: string;
  name: string;
  fdc_id: number | null;
  /** All macro fields on this table are per 100 g, unlike meal_ingredients. */
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  micronutrients: Micronutrients;
  last_used_at: string;
  is_favorite: boolean;
  created_at: string;
};

/** Running totals for a set of meals. `micros` is keyed by TRACKED_MICROS label. */
export type MacroTotals = {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  micros: Record<string, number>;
};
