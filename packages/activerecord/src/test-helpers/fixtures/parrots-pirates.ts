import { ref } from "../../fixtures.js";

export const parrotsPiratesFixtureData = {
  george_blackbeard: {
    parrot_id: ref("parrots", "george"),
    pirate_id: ref("pirates", "blackbeard"),
  },
  louis_blackbeard: {
    parrot_id: ref("parrots", "louis"),
    pirate_id: ref("pirates", "blackbeard"),
  },
};
