import { ref } from "../../fixtures.js";

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
  defaults_sapphire: {
    parrot_id: ref("parrots", "DEFAULTS"),
    treasure_id: ref("treasures", "sapphire"),
  },
  defaults_ruby: {
    parrot_id: ref("parrots", "DEFAULTS"),
    treasure_id: ref("treasures", "ruby"),
  },
  davey_sapphire: {
    parrot_id: ref("parrots", "davey"),
    treasure_id: ref("treasures", "sapphire"),
  },
  davey_ruby: {
    parrot_id: ref("parrots", "davey"),
    treasure_id: ref("treasures", "ruby"),
  },
};
