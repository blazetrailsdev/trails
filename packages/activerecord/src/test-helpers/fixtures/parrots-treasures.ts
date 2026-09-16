import { FixtureSet } from "../../fixtures.js";

export const parrotsTreasuresFixtureData = {
  george_diamond: {
    parrot_id: FixtureSet.identify("george"),
    treasure_id: FixtureSet.identify("diamond"),
  },
  george_sapphire: {
    parrot_id: FixtureSet.identify("george"),
    treasure_id: FixtureSet.identify("sapphire"),
  },
  louis_diamond: {
    parrot_id: FixtureSet.identify("louis"),
    treasure_id: FixtureSet.identify("diamond"),
  },
  louis_sapphire: {
    parrot_id: FixtureSet.identify("louis"),
    treasure_id: FixtureSet.identify("sapphire"),
  },
  polly_sapphire: {
    parrot_id: 4,
    treasure_id: FixtureSet.identify("sapphire"),
  },
  polly_ruby: {
    parrot_id: 4,
    treasure_id: FixtureSet.identify("ruby"),
  },
  defaults_sapphire: {
    parrot_id: FixtureSet.identify("DEFAULTS"),
    treasure_id: FixtureSet.identify("sapphire"),
  },
  defaults_ruby: {
    parrot_id: FixtureSet.identify("DEFAULTS"),
    treasure_id: FixtureSet.identify("ruby"),
  },
  davey_sapphire: {
    parrot_id: FixtureSet.identify("davey"),
    treasure_id: FixtureSet.identify("sapphire"),
  },
  davey_ruby: {
    parrot_id: FixtureSet.identify("davey"),
    treasure_id: FixtureSet.identify("ruby"),
  },
};
