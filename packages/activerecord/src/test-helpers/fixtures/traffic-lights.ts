// activerecord/test/fixtures/traffic_lights.yml
// `state` / `long_state` are serialized array columns in Rails;
// fixtures:compare uses strict `===` so the arrays soft-DIFF.
export const trafficLightFixtureData = {
  uk: {
    location: "UK",
    state: ["Green", "Red", "Orange"],
    long_state: ["Green, go ahead", "Red, wait", "Orange, caution light is about to switch"],
  },
};
