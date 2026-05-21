import { ref } from "../define-fixtures.js";

// activerecord/test/fixtures/parrots.yml
// `_fixture: ignore: DEAD_PARROT` and the DEFAULTS anchor row are YAML-only
// scaffolding (Rails skips them); we expand the merge inline and omit them.
// `treasures: ...` is a HABTM association declared in YAML — it doesn't map
// to a column on parrots so it's not represented here.
export const parrotFixtureData = {
  george: {
    name: "Curious George",
    parrot_sti_class: "LiveParrot",
    breed: "australian",
  },
  louis: {
    name: "King Louis",
    parrot_sti_class: "LiveParrot",
    breed: "african",
  },
  frederick: {
    name: "frederick",
    parrot_sti_class: "LiveParrot",
    breed: "african",
  },
  polly: {
    id: 4,
    name: "polly",
    killer_id: ref("pirates", "blackbeard"),
    parrot_sti_class: "DeadParrot",
  },
  davey: {
    parrot_sti_class: "LiveParrot",
    breed: "australian",
  },
};
