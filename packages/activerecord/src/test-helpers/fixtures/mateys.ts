import { ref } from "../define-fixtures.js";

// activerecord/test/fixtures/mateys.yml
export const mateyFixtureData = {
  blackbeard_to_redbeard: {
    pirate_id: ref("pirates", "blackbeard"),
    target_id: ref("pirates", "redbeard"),
    weight: 10,
  },
};
