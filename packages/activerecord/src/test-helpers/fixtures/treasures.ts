import { ref } from "../../fixtures.js";

export const treasureFixtureData = {
  diamond: {
    name: "diamond",
  },
  sapphire: {
    name: "sapphire",
    looter_id: ref("pirates", "redbeard"),
    looter_type: "Pirate",
  },
  ruby: {
    name: "ruby",
    looter_id: ref("parrots", "louis"),
    looter_type: "Parrot",
  },
  emerald: {
    id: 1,
    name: "emerald",
  },
};
