// Dynamic config layered on app.json. CI sets EXPO_BASE_URL=/dreamyapp so the website
// works when hosted under https://<owner>.github.io/dreamyapp/.
//
// Live backend: SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY come from .env.local or from CI / EAS
// environment variables. Both are public by design (row-level security protects the data). Without
// them, or with EXPO_PUBLIC_DEMO=1, the app runs the on-device demo.
module.exports = ({ config }) => ({
  ...config,
  experiments: {
    ...config.experiments,
    ...(process.env.EXPO_BASE_URL ? { baseUrl: process.env.EXPO_BASE_URL } : {}),
  },
  extra: {
    ...config.extra,
    supabaseUrl: process.env.SUPABASE_URL || undefined,
    supabaseKey: process.env.SUPABASE_PUBLISHABLE_KEY || undefined,
    demo: process.env.EXPO_PUBLIC_DEMO === '1',
  },
});
