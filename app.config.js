// Dynamic config layered on app.json. CI sets EXPO_BASE_URL=/dreamyapp so the website
// works when hosted under https://<owner>.github.io/dreamyapp/.
module.exports = ({ config }) => ({
  ...config,
  experiments: {
    ...config.experiments,
    ...(process.env.EXPO_BASE_URL ? { baseUrl: process.env.EXPO_BASE_URL } : {}),
  },
});
