import { ref } from "../define-fixtures.js";

// activerecord/test/fixtures/ships.yml
export const shipFixtureData = {
  black_pearl: {
    name: "Black Pearl",
    pirate_id: ref("pirates", "blackbeard"),
  },
  interceptor: {
    id: 2,
    name: "Interceptor",
  },
};
