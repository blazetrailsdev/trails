import { ref } from "../define-fixtures.js";

// activerecord/test/fixtures/doubloons.yml
export const doubloonFixtureData = {
  blackbeards_doubloon: {
    pirate_id: ref("pirates", "blackbeard"),
    weight: 2,
  },
};
