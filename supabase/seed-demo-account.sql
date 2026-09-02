-- Seeds the App Review demo account with realistic data.
--
-- WHY THIS EXISTS
--
-- Every screen in FitTrack.AI is auth-gated, so App Review signs in and judges
-- the app on whatever that account contains. An account with no data renders
-- empty states everywhere — no charts, no trends, no weekly review — which
-- reviewers routinely read as "the app does not work" (guideline 2.1).
--
-- It also fixes the two weak spots in the store screenshots: "0 lb Volume
-- lifted" on Trends, and no per-set logging visible anywhere, despite per-set
-- logging being the differentiator the description leads with.
--
-- Timestamps are anchored to local midnight (day0) rather than offset from
-- now(), so the data lands on the intended calendar days no matter what time
-- the script is run — running it just after midnight otherwise pushed every
-- meal onto the previous day and left Today empty.
--
-- Re-run it shortly before submitting: the timestamps are absolute, so the
-- 'today' data ages out if review happens days later.
--
-- It also grants the demo account Pro (see the bottom of the block), because the
-- free tier's one-coach-message-a-day allowance is not enough for a reviewer to
-- judge the feature the listing leads with.
--
-- Run in the Supabase SQL Editor. Safe to run more than once: it deletes the
-- demo user's existing rows first, and it touches nothing belonging to anyone
-- else.
--
-- If you used a different address for the demo account, change it in the
-- select on the first line of the block below.

do $$
declare
  uid  uuid;
  -- Local midnight today, as an instant. The database runs in UTC but the app
  -- buckets days in APP_TZ (America/Toronto, see src/lib/day.ts), so anchoring
  -- on day0 would put every row at 8pm the previous local
  -- day and shift the whole dataset back by one.
  day0 timestamptz;
  m   uuid;
  w   uuid;
  we  uuid;
  d   int;
begin
  day0 := date_trunc('day', now() at time zone 'America/Toronto') at time zone 'America/Toronto';

  select id into uid from auth.users where email = 'fittrack.review@gmail.com';
  if uid is null then
    raise exception 'No account for fittrack.review@gmail.com — create it in the app first.';
  end if;

  -- Clean slate for this user only. Children cascade from their parents.
  delete from meals         where user_id = uid;
  delete from workouts      where user_id = uid;
  delete from water_logs    where user_id = uid;

  -- Profile drives BMR and the "under maintenance" figure on the dashboard.
  insert into profiles (id, height_in, age, weight_lb, sex, updated_at)
  values (uid, 71, 20, 178, 'male', now())
  on conflict (id) do update
    set height_in = excluded.height_in,
        age       = excluded.age,
        weight_lb = excluded.weight_lb,
        sex       = excluded.sex,
        updated_at = now();

  insert into goals (id, calorie_target, protein_target_g, carbs_target_g,
                     fat_target_g, workouts_per_week, water_target_oz, updated_at)
  values (uid, 2800, 180, 300, 80, 4, 100, now())
  on conflict (id) do update
    set calorie_target    = excluded.calorie_target,
        protein_target_g  = excluded.protein_target_g,
        carbs_target_g    = excluded.carbs_target_g,
        fat_target_g      = excluded.fat_target_g,
        workouts_per_week = excluded.workouts_per_week,
        water_target_oz   = excluded.water_target_oz,
        updated_at = now();

  -- ---------------------------------------------------------------- meals
  -- 14 days so the trends charts have a full window rather than one dot.
  for d in 0..13 loop
    -- Breakfast
    insert into meals (user_id, name, eaten_at)
    values (uid, 'Greek yogurt, berries and granola', day0 - (d || ' days')::interval + interval '8 hours')
    returning id into m;
    insert into meal_ingredients (meal_id, name, weight_g, calories, protein_g, carbs_g, fat_g, micronutrients) values
      (m, 'Greek yogurt, plain 2%', 200, 146, 20, 8, 4,  '{"Fiber":{"amount":0,"unit":"g"}}'),
      (m, 'Blueberries',            80,  46,  1, 12, 0,  '{"Fiber":{"amount":2,"unit":"g"}}'),
      (m, 'Granola',                45, 200,  5, 30, 7,  '{"Fiber":{"amount":3,"unit":"g"}}');

    -- Lunch
    insert into meals (user_id, name, eaten_at)
    values (uid, 'Chipotle chicken bowl', day0 - (d || ' days')::interval + interval '12 hours 30 minutes')
    returning id into m;
    insert into meal_ingredients (meal_id, name, weight_g, calories, protein_g, carbs_g, fat_g, micronutrients) values
      (m, 'Chicken (sofritas/grilled)', 150, 190, 38,  0,  4, '{"Sodium":{"amount":620,"unit":"mg"}}'),
      (m, 'White rice',                 180, 234,  4, 51,  1, '{"Fiber":{"amount":1,"unit":"g"}}'),
      (m, 'Black beans',                120, 155, 10, 27,  1, '{"Fiber":{"amount":9,"unit":"g"}}'),
      (m, 'Fajita veg + salsa',         100,  45,  2,  9,  1, '{"Potassium":{"amount":320,"unit":"mg"}}'),
      (m, 'Cheese',                      30, 110,  7,  1,  9, '{"Cholesterol":{"amount":30,"unit":"mg"}}');

    -- Dinner
    insert into meals (user_id, name, eaten_at)
    values (uid, 'Salmon, rice and broccoli', day0 - (d || ' days')::interval + interval '19 hours')
    returning id into m;
    insert into meal_ingredients (meal_id, name, weight_g, calories, protein_g, carbs_g, fat_g, micronutrients) values
      (m, 'Salmon fillet',  200, 412, 44,  0, 26, '{"Potassium":{"amount":800,"unit":"mg"}}'),
      (m, 'Jasmine rice',   180, 234,  4, 51,  1, '{"Fiber":{"amount":1,"unit":"g"}}'),
      (m, 'Broccoli',       150,  51,  4, 10,  1, '{"Fiber":{"amount":4,"unit":"g"}}');

    insert into water_logs (user_id, amount_oz, logged_at)
    values (uid, 24, day0 - (d || ' days')::interval + interval '9 hours'),
           (uid, 24, day0 - (d || ' days')::interval + interval '14 hours'),
           (uid, 32, day0 - (d || ' days')::interval + interval '18 hours');
  end loop;

  -- ------------------------------------------------------------- workouts
  -- Per-set rows are the whole point: this is what puts a real number in
  -- "Volume lifted" and what the App Store description leads with.

  -- Push day, today
  insert into workouts (user_id, name, bodyweight_lb, performed_at, source)
  values (uid, 'Push day', 178, day0 + interval '17 hours', 'manual')
  returning id into w;

  insert into workout_exercises (workout_id, name, category, met, duration_min, calories)
  values (w, 'Bench press', 'strength', 5.0, 22, 168) returning id into we;
  insert into exercise_sets (workout_exercise_id, set_index, weight_lb, reps) values
    (we, 1, 135, 10), (we, 2, 155, 8), (we, 3, 175, 5), (we, 4, 175, 5);

  insert into workout_exercises (workout_id, name, category, met, duration_min, calories)
  values (w, 'Overhead press', 'strength', 5.0, 14, 107) returning id into we;
  insert into exercise_sets (workout_exercise_id, set_index, weight_lb, reps) values
    (we, 1, 85, 10), (we, 2, 95, 8), (we, 3, 105, 6);

  insert into workout_exercises (workout_id, name, category, met, duration_min, calories)
  values (w, 'Incline dumbbell press', 'strength', 5.0, 12, 92) returning id into we;
  insert into exercise_sets (workout_exercise_id, set_index, weight_lb, reps) values
    (we, 1, 50, 12), (we, 2, 60, 10), (we, 3, 60, 9);

  -- Pull day, two days ago
  insert into workouts (user_id, name, bodyweight_lb, performed_at, source)
  values (uid, 'Pull day', 178, day0 - interval '2 days' + interval '17 hours', 'manual')
  returning id into w;

  insert into workout_exercises (workout_id, name, category, met, duration_min, calories)
  values (w, 'Deadlift', 'strength', 6.0, 25, 229) returning id into we;
  insert into exercise_sets (workout_exercise_id, set_index, weight_lb, reps) values
    (we, 1, 225, 8), (we, 2, 275, 5), (we, 3, 315, 3), (we, 4, 315, 3);

  insert into workout_exercises (workout_id, name, category, met, duration_min, calories)
  values (w, 'Barbell row', 'strength', 5.0, 16, 122) returning id into we;
  insert into exercise_sets (workout_exercise_id, set_index, weight_lb, reps) values
    (we, 1, 135, 10), (we, 2, 155, 8), (we, 3, 155, 8);

  -- Leg day, four days ago
  insert into workouts (user_id, name, bodyweight_lb, performed_at, source)
  values (uid, 'Leg day', 177, day0 - interval '4 days' + interval '17 hours', 'manual')
  returning id into w;

  insert into workout_exercises (workout_id, name, category, met, duration_min, calories)
  values (w, 'Back squat', 'strength', 6.0, 28, 257) returning id into we;
  insert into exercise_sets (workout_exercise_id, set_index, weight_lb, reps) values
    (we, 1, 185, 8), (we, 2, 225, 5), (we, 3, 245, 5), (we, 4, 245, 4);

  insert into workout_exercises (workout_id, name, category, met, duration_min, calories)
  values (w, 'Romanian deadlift', 'strength', 5.0, 15, 114) returning id into we;
  insert into exercise_sets (workout_exercise_id, set_index, weight_lb, reps) values
    (we, 1, 135, 12), (we, 2, 155, 10), (we, 3, 155, 10);

  -- A run, six days ago, so cardio appears alongside lifting
  insert into workouts (user_id, name, bodyweight_lb, performed_at, source)
  values (uid, 'Easy run', 177, day0 - interval '6 days' + interval '7 hours', 'manual')
  returning id into w;
  insert into workout_exercises (workout_id, name, category, met, duration_min, calories)
  values (w, 'Running', 'cardio', 9.0, 32, 425);

  -- ------------------------------------------------------------------ Pro
  -- App Review has to be able to exercise the AI features, and the free tier
  -- allows ONE coach message and three photo scans a day. A reviewer who spends
  -- those on test shots then meets "that's all the AI for today" on the feature
  -- the App Store description leads with — and, because this build ships with no
  -- RevenueCat key, there is deliberately no upgrade button to explain it.
  --
  -- A promotional grant sidesteps that: 15 scans and 15 coach messages a day,
  -- with a $0.45 spend cap instead of $0.04. It writes the 'promotional' source,
  -- which sits alongside app_store/stripe and is never overwritten by a webhook.
  insert into entitlements (user_id, source, tier, status, product_id, store,
                            expires_at, updated_at)
  values (uid, 'promotional', 'pro', 'active', 'app_review', 'promotional',
          now() + interval '1 year', now())
  on conflict (user_id, source) do update
    set tier       = excluded.tier,
        status     = excluded.status,
        expires_at = excluded.expires_at,
        updated_at = now();

  raise notice 'Seeded demo account % and granted Pro for App Review', uid;
end $$;
