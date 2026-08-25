import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // supabase/ holds Deno Edge Functions: they import jsr:/npm: specifiers and
    // use Deno.test, neither of which vitest understands. They have their own
    // runner — `deno test supabase/functions/_shared/` — see supabase/README.md.
    exclude: ['node_modules/**', 'supabase/**'],
  },
});
