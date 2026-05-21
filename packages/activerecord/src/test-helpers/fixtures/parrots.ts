import { ref } from "../define-fixtures.js";

// activerecord/test/fixtures/parrots.yml
// Rails' `_fixture: ignore: DEAD_PARROT` skips DEAD_PARROT only; the DEFAULTS
// anchor row is also a real fixture row (Rails inserts it). YAML anchors and
// merges (`<<: *DEAD_PARROT`, `*DEFAULTS`) are expanded inline. `treasures:`
// is a HABTM association declared in YAML — it doesn't map to a column on
// parrots, so it's not represented here.
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
  DEFAULTS: {
    parrot_sti_class: "LiveParrot",
    breed: "australian",
  },
  davey: {
    parrot_sti_class: "LiveParrot",
    breed: "australian",
  },
};
