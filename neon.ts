import { defineConfig } from "@neon/config/v1";

export default defineConfig({
  // Neon Auth: everyone signs in with a one-time code emailed to them (see src/components/LiveGate.tsx).
  auth: true,
  // Data API: the app reads and writes through it; row-level security in db/migrations decides
  // what each signed-in person can see.
  dataApi: {
    authProvider: "neon",
    settings: { dbSchemas: ["public"], dbMaxRows: 1000 },
  },
  // Branch policy: per-branch tuning
  branch: (branch) => {
    if (branch.isDefault) {
      // Default branch: no overrides, uses project defaults
      return {};
    }
    if (!branch.exists) {
      // New non-default branches: auto-expire
      // Run `neon checkout <name>` to create a new branch with these settings
      return { ttl: "7d" };
    }
    // Existing branch: no changes
    return {};
  },
});
