import { ref } from "../define-fixtures.js";

// activerecord/test/fixtures/dogs.yml
export const dogFixtureData = {
  sophie: {
    id: 1,
    trainer_id: 1,
    dog_lover_id: ref("dog_lovers", "joanna"),
  },
};
