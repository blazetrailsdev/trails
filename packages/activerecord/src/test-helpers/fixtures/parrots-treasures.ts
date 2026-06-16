import { ref } from "../define-fixtures.js";

// activerecord/test/fixtures/parrots.yml declares the HABTM via the per-parrot
// `treasures:` lists (george/louis → diamond, sapphire; polly → sapphire, ruby);
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
  polly_sapphire: {
    parrot_id: ref("parrots", "polly"),
    treasure_id: ref("treasures", "sapphire"),
  },
  polly_ruby: {
    parrot_id: ref("parrots", "polly"),
    treasure_id: ref("treasures", "ruby"),
  },
};
