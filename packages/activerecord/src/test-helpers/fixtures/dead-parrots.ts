import { ref } from "../define-fixtures.js";

// activerecord/test/fixtures/dead_parrots.yml
// STI rows for the parrots table.
export const deadParrotFixtureData = {
  deadbird: {
    name: "Dusty DeadBird",
    parrot_sti_class: "DeadParrot",
    killer_id: ref("pirates", "blackbeard"),
  },
};
