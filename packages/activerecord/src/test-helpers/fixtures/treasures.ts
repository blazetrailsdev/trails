import { ref } from "../define-fixtures.js";

// activerecord/test/fixtures/treasures.yml
// `looter: <row> (<Type>)` is Rails' polymorphic shorthand → looter_id +
// looter_type pair.
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
