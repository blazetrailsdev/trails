import { ref } from "../define-fixtures.js";

// activerecord/test/fixtures/parrots.yml declares the HABTM via
// `george: treasures: diamond, sapphire` / `louis: treasures: [diamond, sapphire]`;
// Rails materializes those into the parrots_treasures join table.
export const parrotsTreasuresFixtureData = {
  george_diamond: {
    parrot_id: ref("parrots", "george"),
    treasure_id: ref("treasures", "diamond"),
  },
  george_sapphire: {
    parrot_id: ref("parrots", "george"),
    treasure_id: ref("treasures", "sapphire"),
  },
  louis_diamond: {
    parrot_id: ref("parrots", "louis"),
    treasure_id: ref("treasures", "diamond"),
  },
  louis_sapphire: {
    parrot_id: ref("parrots", "louis"),
    treasure_id: ref("treasures", "sapphire"),
  },
};
