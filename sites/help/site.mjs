import deployment from "./deployment.generated.json" with { type: "json" };
// Standalone public-content settings. Never import the app's runtime configuration.
export const site = {
  name: "Remy Sport Help",
  origin: deployment.origin,
  environment: deployment.environment,
  appOrigin: deployment.appOrigin,
  description: "Guides to finding games, signing in, following teams and managing notifications in Remy Sport.",
  reviewedAt: "2026-09-09",
};
