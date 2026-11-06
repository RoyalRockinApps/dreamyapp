// Dynamic config layered on app.json. CI sets EXPO_BASE_URL=/dreamyapp so the website
// works when hosted under https://<owner>.github.io/dreamyapp/.
//
// Live backend: NEON_AUTH_BASE_URL and NEON_DATA_API_URL come from .env.local (written by
// `neon env pull`) or from CI variables. Both are public endpoints, not secrets. Without them,
// or with EXPO_PUBLIC_DEMO=1, the app runs the on-device demo.
module.exports = ({ config }) => ({
  ...config,
  experiments: {
    ...config.experiments,
    ...(process.env.EXPO_BASE_URL ? { baseUrl: process.env.EXPO_BASE_URL } : {}),
  },
  extra: {
    ...config.extra,
    neonAuthUrl: process.env.NEON_AUTH_BASE_URL || undefined,
    neonDataApiUrl: process.env.NEON_DATA_API_URL || undefined,
    demo: process.env.EXPO_PUBLIC_DEMO === '1',
  },
});
