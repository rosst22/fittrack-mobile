import { defineConfig } from 'vitest/config';

// day.ts now resolves the timezone from the device rather than hardcoding
// Toronto, so the day-bucketing tests — which assert specific Toronto
// offsets — would otherwise pass or fail depending on where the machine
// running them happens to be. Pinning TZ here keeps them deterministic on
// any laptop and in CI, while leaving the app itself device-derived.
process.env.TZ = 'America/Toronto';

export default defineConfig({
  test: {
    env: { TZ: 'America/Toronto' },
    // supabase/ holds Deno Edge Functions: they import jsr:/npm: specifiers and
    // use Deno.test, neither of which vitest understands. They have their own
    // runner — `deno test supabase/functions/_shared/` — see supabase/README.md.
    exclude: ['node_modules/**', 'supabase/**'],
  },
});
