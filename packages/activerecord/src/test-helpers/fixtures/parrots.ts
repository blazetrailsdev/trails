import { ref } from "../../fixtures.js";

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
