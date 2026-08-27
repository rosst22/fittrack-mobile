// Every read/write the app makes against Supabase.
//
// Keeping them in one file (rather than inline in screens) mirrors what
// meal-tracker/src/lib/actions.ts does on the web side, and means the day
// boundaries always go through day.ts instead of being re-derived per screen.
//
// None of these functions pass a user id. They do not need to: RLS filters
// every table by auth.uid() server-side, so a bare select returns only the
// signed-in user's rows. Adding .eq('user_id', ...) here would be redundant,
// and would give the false impression that the client is what enforces it.
import { dayKey, dayRange, shiftDate, todayStr } from '@/lib/day';
import { addMicros, emptyMicroTotals } from '@/lib/micros';
import { supabase } from '@/lib/supabase';
import type {
  FoodLibraryItem,
  Goals,
  MacroTotals,
  MealWithIngredients,
  Micronutrients,
  Profile,
  Supplement,
  Habit,
  WaterLog,
  WorkoutWithExercises,
} from '@/lib/types';

const MEAL_SELECT =
  'id, user_id, name, eaten_at, created_at, photo_path, is_favorite, ' +
  'meal_ingredients (id, meal_id, fdc_id, name, weight_g, calories, protein_g, carbs_g, fat_g, micronutrients, created_at)';

const WORKOUT_SELECT =
  'id, user_id, name, bodyweight_lb, performed_at, created_at, source, whoop_workout_id, ' +
  'workout_exercises (id, workout_id, name, category, met, duration_min, calories, created_at, ' +
  'exercise_sets (id, workout_exercise_id, set_index, weight_lb, reps, created_at))';

/**
 * Throws on error so screens can rely on a resolved value being valid.
 *
 * `data` is taken as `unknown` on purpose. The Supabase client here is not
 * parameterised with a generated Database type, so for queries that embed a
 * related table ("meals (…, meal_ingredients (…))") its inferred row type
 * collapses to GenericStringError[] rather than anything useful. The real shape
 * is asserted by each caller's return annotation against src/lib/types.ts.
 */
function unwrap<T>({ data, error }: { data: unknown; error: { message: string } | null }): T {
  if (error) throw new Error(error.message);
  return data as T;
}

// ---------------------------------------------------------------- meals

export async function getMealsForDay(dateStr: string): Promise<MealWithIngredients[]> {
  const { start, end } = dayRange(dateStr);
  return unwrap(
    await supabase
      .from('meals')
      .select(MEAL_SELECT)
      .gte('eaten_at', start)
      .lte('eaten_at', end)
      .order('eaten_at', { ascending: true })
  );
}

export async function getMealsBetween(
  fromDateStr: string,
  toDateStr: string
): Promise<MealWithIngredients[]> {
  const { start } = dayRange(fromDateStr);
  const { end } = dayRange(toDateStr);
  return unwrap(
    await supabase
      .from('meals')
      .select(MEAL_SELECT)
      .gte('eaten_at', start)
      .lte('eaten_at', end)
      .order('eaten_at', { ascending: true })
  );
}

export async function getMeal(id: string): Promise<MealWithIngredients> {
  return unwrap(await supabase.from('meals').select(MEAL_SELECT).eq('id', id).single());
}

export async function deleteMeal(id: string): Promise<void> {
  // meal_ingredients cascade on delete, so one statement is enough.
  const { error } = await supabase.from('meals').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

export async function toggleMealFavorite(id: string, next: boolean): Promise<void> {
  const { error } = await supabase.from('meals').update({ is_favorite: next }).eq('id', id);
  if (error) throw new Error(error.message);
}

export type NewIngredient = {
  name: string;
  fdc_id?: number | null;
  weight_g: number;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  micronutrients?: Micronutrients;
};

/**
 * Creates a meal and its ingredients. The insert is two statements because
 * PostgREST cannot insert into a parent and child in one call; if the second
 * fails the first is rolled back by hand, since there is no transaction
 * available over REST.
 */
export async function createMeal(input: {
  name: string;
  eatenAtIso: string;
  ingredients: NewIngredient[];
}): Promise<string> {
  const userId = (await supabase.auth.getUser()).data.user?.id;
  if (!userId) throw new Error('Not signed in.');

  const meal = unwrap(
    await supabase
      .from('meals')
      .insert({ user_id: userId, name: input.name, eaten_at: input.eatenAtIso })
      .select('id')
      .single()
  ) as { id: string };

  if (input.ingredients.length > 0) {
    const { error } = await supabase.from('meal_ingredients').insert(
      input.ingredients.map((i) => ({
        meal_id: meal.id,
        name: i.name,
        fdc_id: i.fdc_id ?? null,
        weight_g: i.weight_g,
        calories: i.calories,
        protein_g: i.protein_g,
        carbs_g: i.carbs_g,
        fat_g: i.fat_g,
        micronutrients: i.micronutrients ?? {},
      }))
    );
    if (error) {
      await supabase.from('meals').delete().eq('id', meal.id);
      throw new Error(error.message);
    }
    await saveToFoodLibrary(userId, input.ingredients);
  }

  return meal.id;
}

export async function updateMeal(
  id: string,
  input: { name: string; eatenAtIso: string; ingredients: NewIngredient[] }
): Promise<void> {
  const userId = (await supabase.auth.getUser()).data.user?.id;
  if (!userId) throw new Error('Not signed in.');

  const { error: mealError } = await supabase
    .from('meals')
    .update({ name: input.name, eaten_at: input.eatenAtIso })
    .eq('id', id);
  if (mealError) throw new Error(mealError.message);

  // Replace the ingredient list wholesale — simpler and safer than diffing,
  // and the rows are tiny.
  const { error: delError } = await supabase.from('meal_ingredients').delete().eq('meal_id', id);
  if (delError) throw new Error(delError.message);

  if (input.ingredients.length > 0) {
    const { error } = await supabase.from('meal_ingredients').insert(
      input.ingredients.map((i) => ({
        meal_id: id,
        name: i.name,
        fdc_id: i.fdc_id ?? null,
        weight_g: i.weight_g,
        calories: i.calories,
        protein_g: i.protein_g,
        carbs_g: i.carbs_g,
        fat_g: i.fat_g,
        micronutrients: i.micronutrients ?? {},
      }))
    );
    if (error) throw new Error(error.message);
    await saveToFoodLibrary(userId, input.ingredients);
  }
}

/**
 * Auto-saves every logged ingredient to the personal library at per-100g.
 * Deliberately does NOT write is_favorite — re-logging a food must not clear
 * its star (same rule as the web app).
 */
async function saveToFoodLibrary(userId: string, ingredients: NewIngredient[]) {
  const rows = ingredients
    .filter((i) => i.weight_g > 0)
    .map((i) => {
      const per100 = 100 / i.weight_g;
      return {
        user_id: userId,
        name: i.name.trim(),
        fdc_id: i.fdc_id ?? null,
        calories: i.calories * per100,
        protein_g: i.protein_g * per100,
        carbs_g: i.carbs_g * per100,
        fat_g: i.fat_g * per100,
        micronutrients: i.micronutrients ?? {},
        last_used_at: new Date().toISOString(),
      };
    });
  if (rows.length === 0) return;
  // Failure here must not fail the meal save — the library is a convenience.
  await supabase.from('food_library').upsert(rows, { onConflict: 'user_id,name' });
}

// ---------------------------------------------------------------- food library

export async function getFoodLibrary(favoritesOnly = false): Promise<FoodLibraryItem[]> {
  let q = supabase.from('food_library').select('*').order('last_used_at', { ascending: false });
  if (favoritesOnly) q = q.eq('is_favorite', true);
  return unwrap(await q.limit(200));
}

export async function toggleFoodFavorite(id: string, next: boolean): Promise<void> {
  const { error } = await supabase.from('food_library').update({ is_favorite: next }).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function deleteFoodLibraryItem(id: string): Promise<void> {
  const { error } = await supabase.from('food_library').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

export async function getRecentMeals(limit = 40): Promise<MealWithIngredients[]> {
  return unwrap(
    await supabase
      .from('meals')
      .select(MEAL_SELECT)
      .order('is_favorite', { ascending: false })
      .order('eaten_at', { ascending: false })
      .limit(limit)
  );
}

// ---------------------------------------------------------------- workouts

export async function getWorkoutsForDay(dateStr: string): Promise<WorkoutWithExercises[]> {
  const { start, end } = dayRange(dateStr);
  return unwrap(
    await supabase
      .from('workouts')
      .select(WORKOUT_SELECT)
      .gte('performed_at', start)
      .lte('performed_at', end)
      .order('performed_at', { ascending: false })
  );
}

export async function getWorkoutsBetween(
  fromDateStr: string,
  toDateStr: string
): Promise<WorkoutWithExercises[]> {
  const { start } = dayRange(fromDateStr);
  const { end } = dayRange(toDateStr);
  return unwrap(
    await supabase
      .from('workouts')
      .select(WORKOUT_SELECT)
      .gte('performed_at', start)
      .lte('performed_at', end)
      .order('performed_at', { ascending: false })
  );
}

export async function getRecentWorkouts(limit = 50): Promise<WorkoutWithExercises[]> {
  return unwrap(
    await supabase
      .from('workouts')
      .select(WORKOUT_SELECT)
      .order('performed_at', { ascending: false })
      .limit(limit)
  );
}

export async function getWorkout(id: string): Promise<WorkoutWithExercises> {
  return unwrap(await supabase.from('workouts').select(WORKOUT_SELECT).eq('id', id).single());
}

export async function deleteWorkout(id: string): Promise<void> {
  const { error } = await supabase.from('workouts').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

export type NewExercise = {
  name: string;
  category: string;
  met: number;
  duration_min: number;
  calories: number;
  sets: { weight_lb: number | null; reps: number | null }[];
};

export async function createWorkout(input: {
  name: string;
  performedAtIso: string;
  bodyweightLb: number | null;
  exercises: NewExercise[];
}): Promise<string> {
  const userId = (await supabase.auth.getUser()).data.user?.id;
  if (!userId) throw new Error('Not signed in.');

  const workout = unwrap(
    await supabase
      .from('workouts')
      .insert({
        user_id: userId,
        name: input.name,
        performed_at: input.performedAtIso,
        bodyweight_lb: input.bodyweightLb,
        source: 'manual',
      })
      .select('id')
      .single()
  ) as { id: string };

  try {
    await insertExercises(workout.id, input.exercises);
  } catch (e) {
    await supabase.from('workouts').delete().eq('id', workout.id);
    throw e;
  }
  return workout.id;
}

export async function updateWorkout(
  id: string,
  input: {
    name: string;
    performedAtIso: string;
    bodyweightLb: number | null;
    exercises: NewExercise[];
  }
): Promise<void> {
  const { error } = await supabase
    .from('workouts')
    .update({
      name: input.name,
      performed_at: input.performedAtIso,
      bodyweight_lb: input.bodyweightLb,
    })
    .eq('id', id);
  if (error) throw new Error(error.message);

  const { error: delError } = await supabase
    .from('workout_exercises')
    .delete()
    .eq('workout_id', id);
  if (delError) throw new Error(delError.message);

  await insertExercises(id, input.exercises);
}

async function insertExercises(workoutId: string, exercises: NewExercise[]) {
  for (const ex of exercises) {
    const row = unwrap(
      await supabase
        .from('workout_exercises')
        .insert({
          workout_id: workoutId,
          name: ex.name,
          category: ex.category,
          met: ex.met,
          duration_min: ex.duration_min,
          calories: ex.calories,
        })
        .select('id')
        .single()
    ) as { id: string };

    const sets = ex.sets.filter((s) => s.reps != null || s.weight_lb != null);
    if (sets.length > 0) {
      const { error } = await supabase.from('exercise_sets').insert(
        sets.map((s, i) => ({
          workout_exercise_id: row.id,
          set_index: i + 1,
          weight_lb: s.weight_lb,
          reps: s.reps,
        }))
      );
      if (error) throw new Error(error.message);
    }
  }
}

// ---------------------------------------------------------------- water

export async function getWaterForDay(dateStr: string): Promise<WaterLog[]> {
  const { start, end } = dayRange(dateStr);
  return unwrap(
    await supabase
      .from('water_logs')
      .select('*')
      .gte('logged_at', start)
      .lte('logged_at', end)
      .order('logged_at', { ascending: true })
  );
}

export async function addWater(amountOz: number, dateStr: string): Promise<void> {
  const userId = (await supabase.auth.getUser()).data.user?.id;
  if (!userId) throw new Error('Not signed in.');
  // Log against the selected day, not literally now, so back-filling yesterday
  // does not land the row in today's bucket.
  const loggedAt = dateStr === todayStr() ? new Date().toISOString() : dayRange(dateStr).start;
  const { error } = await supabase
    .from('water_logs')
    .insert({ user_id: userId, amount_oz: amountOz, logged_at: loggedAt });
  if (error) throw new Error(error.message);
}

export async function deleteWaterLog(id: string): Promise<void> {
  const { error } = await supabase.from('water_logs').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

// ---------------------------------------------------------------- habits & supplements

export async function getHabitsWithTodayLogs(dateStr: string) {
  const { start, end } = dayRange(dateStr);
  const habits = unwrap(
    await supabase.from('habits').select('*').eq('active', true).order('created_at')
  ) as Habit[];
  const logs = unwrap(
    await supabase
      .from('habit_logs')
      .select('id, habit_id, done_at')
      .gte('done_at', start)
      .lte('done_at', end)
  ) as { id: string; habit_id: string; done_at: string }[];
  const doneIds = new Set(logs.map((l) => l.habit_id));
  return habits.map((h) => ({
    ...h,
    done: doneIds.has(h.id),
    logId: logs.find((l) => l.habit_id === h.id)?.id ?? null,
  }));
}

export async function setHabitDone(
  habitId: string,
  done: boolean,
  dateStr: string,
  logId: string | null
): Promise<void> {
  if (done) {
    const at = dateStr === todayStr() ? new Date().toISOString() : dayRange(dateStr).start;
    const { error } = await supabase
      .from('habit_logs')
      .insert({ habit_id: habitId, done_at: at });
    if (error) throw new Error(error.message);
  } else if (logId) {
    const { error } = await supabase.from('habit_logs').delete().eq('id', logId);
    if (error) throw new Error(error.message);
  }
}

export async function createHabit(name: string): Promise<void> {
  const userId = (await supabase.auth.getUser()).data.user?.id;
  if (!userId) throw new Error('Not signed in.');
  const { error } = await supabase.from('habits').insert({ user_id: userId, name });
  if (error) throw new Error(error.message);
}

export async function archiveHabit(id: string): Promise<void> {
  const { error } = await supabase.from('habits').update({ active: false }).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function getSupplementsWithTodayLogs(dateStr: string) {
  const { start, end } = dayRange(dateStr);
  const supplements = unwrap(
    await supabase.from('supplements').select('*').eq('active', true).order('created_at')
  ) as Supplement[];
  const logs = unwrap(
    await supabase
      .from('supplement_logs')
      .select('id, supplement_id, taken_at')
      .gte('taken_at', start)
      .lte('taken_at', end)
  ) as { id: string; supplement_id: string; taken_at: string }[];
  const takenIds = new Set(logs.map((l) => l.supplement_id));
  return supplements.map((s) => ({
    ...s,
    taken: takenIds.has(s.id),
    logId: logs.find((l) => l.supplement_id === s.id)?.id ?? null,
  }));
}

export async function setSupplementTaken(
  supplementId: string,
  taken: boolean,
  dateStr: string,
  logId: string | null
): Promise<void> {
  if (taken) {
    const at = dateStr === todayStr() ? new Date().toISOString() : dayRange(dateStr).start;
    const { error } = await supabase
      .from('supplement_logs')
      .insert({ supplement_id: supplementId, taken_at: at });
    if (error) throw new Error(error.message);
  } else if (logId) {
    const { error } = await supabase.from('supplement_logs').delete().eq('id', logId);
    if (error) throw new Error(error.message);
  }
}

export async function createSupplement(
  name: string,
  dose: string | null,
  category: 'supplement' | 'medication'
): Promise<void> {
  const userId = (await supabase.auth.getUser()).data.user?.id;
  if (!userId) throw new Error('Not signed in.');
  const { error } = await supabase
    .from('supplements')
    .insert({ user_id: userId, name, dose, category });
  if (error) throw new Error(error.message);
}

export async function archiveSupplement(id: string): Promise<void> {
  const { error } = await supabase.from('supplements').update({ active: false }).eq('id', id);
  if (error) throw new Error(error.message);
}

// ---------------------------------------------------------------- profile & goals

export async function getProfile(): Promise<Profile | null> {
  const { data, error } = await supabase.from('profiles').select('*').maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function saveProfile(input: {
  height_in: number | null;
  age: number | null;
  weight_lb: number | null;
  sex: 'male' | 'female' | null;
}): Promise<void> {
  const userId = (await supabase.auth.getUser()).data.user?.id;
  if (!userId) throw new Error('Not signed in.');
  const { error } = await supabase
    .from('profiles')
    .upsert({ id: userId, ...input, updated_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
}

export async function getGoals(): Promise<Goals | null> {
  const { data, error } = await supabase.from('goals').select('*').maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function saveGoals(input: Partial<Omit<Goals, 'id' | 'updated_at'>>): Promise<void> {
  const userId = (await supabase.auth.getUser()).data.user?.id;
  if (!userId) throw new Error('Not signed in.');
  const { error } = await supabase
    .from('goals')
    .upsert({ id: userId, ...input, updated_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
}

// ---------------------------------------------------------------- derived

export function sumMacros(meals: MealWithIngredients[]): MacroTotals {
  const t: MacroTotals = {
    calories: 0,
    protein_g: 0,
    carbs_g: 0,
    fat_g: 0,
    micros: emptyMicroTotals(),
  };
  for (const meal of meals) {
    for (const ing of meal.meal_ingredients ?? []) {
      t.calories += Number(ing.calories) || 0;
      t.protein_g += Number(ing.protein_g) || 0;
      t.carbs_g += Number(ing.carbs_g) || 0;
      t.fat_g += Number(ing.fat_g) || 0;
      addMicros(t.micros, ing.micronutrients);
    }
  }
  return t;
}

export function sumCaloriesBurned(workouts: WorkoutWithExercises[]): number {
  let total = 0;
  for (const w of workouts) {
    for (const ex of w.workout_exercises ?? []) total += Number(ex.calories) || 0;
  }
  return total;
}

export function sumWater(logs: WaterLog[]): number {
  return logs.reduce((n, l) => n + (Number(l.amount_oz) || 0), 0);
}

/** Inclusive list of "YYYY-MM-DD" from `days` ago through today. */
export function lastNDays(days: number, endDateStr = todayStr()): string[] {
  const out: string[] = [];
  for (let i = days - 1; i >= 0; i--) out.push(shiftDate(endDateStr, -i));
  return out;
}

// ---------------------------------------------------------------- sleep (WHOOP)

/**
 * Nightly sleep, read from the JSON blob WHOOP sync writes on the web app.
 *
 * There is no per-night sleep table — this is a snapshot overwritten on every
 * sync with the last 14 nights, so history reaches back at most 14 nights and
 * only as far as the last sync. If syncing lapses, that stretch is gone
 * permanently. Sync itself stays on the web app; it needs an OAuth secret the
 * phone must not hold.
 *
 * A night is filed under the day it ENDS — Sunday night into Monday morning is
 * Monday's sleep, which is how WHOOP itself presents it. Bucketing by `start`
 * shifts every night back a day.
 */
export type SleepNight = { date: string; hours: number; performance: number | null };

export async function getSleepNights(): Promise<SleepNight[]> {
  const { data, error } = await supabase
    .from('whoop_connections')
    .select('last_sleep_json')
    .maybeSingle();

  if (error || !data) return [];

  type Record = {
    end: string;
    nap: boolean;
    score_state: string;
    score?: {
      sleep_performance_percentage?: number;
      stage_summary?: {
        total_light_sleep_time_milli?: number;
        total_slow_wave_sleep_time_milli?: number;
        total_rem_sleep_time_milli?: number;
      };
    };
  };

  const records = ((data as { last_sleep_json: Record[] | null }).last_sleep_json ?? []).filter(
    (r) => r.score_state === 'SCORED' && !r.nap
  );

  const byDay = new Map<string, { ms: number; performance: number | null }>();
  for (const r of records) {
    const stages = r.score?.stage_summary;
    // Time asleep, not time in bed — light + deep + REM, excluding awake.
    const asleep =
      (stages?.total_light_sleep_time_milli ?? 0) +
      (stages?.total_slow_wave_sleep_time_milli ?? 0) +
      (stages?.total_rem_sleep_time_milli ?? 0);
    const key = dayKey(r.end);
    const prev = byDay.get(key);
    byDay.set(key, {
      ms: (prev?.ms ?? 0) + asleep,
      performance: r.score?.sleep_performance_percentage ?? prev?.performance ?? null,
    });
  }

  return [...byDay.entries()]
    .map(([date, v]) => ({ date, hours: v.ms / 3_600_000, performance: v.performance }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

// ---------------------------------------------------------------- habit history

/** Habit completions per day over a range, for the trends chart. */
export async function getHabitCompletions(
  fromDateStr: string,
  toDateStr: string
): Promise<{ byDay: Record<string, number>; activeHabits: number }> {
  const { start } = dayRange(fromDateStr);
  const { end } = dayRange(toDateStr);

  const [habits, logs] = await Promise.all([
    supabase.from('habits').select('id').eq('active', true),
    supabase.from('habit_logs').select('done_at').gte('done_at', start).lte('done_at', end),
  ]);

  const byDay: Record<string, number> = {};
  for (const row of (logs.data ?? []) as { done_at: string }[]) {
    const key = dayKey(row.done_at);
    byDay[key] = (byDay[key] ?? 0) + 1;
  }
  return { byDay, activeHabits: (habits.data ?? []).length };
}
