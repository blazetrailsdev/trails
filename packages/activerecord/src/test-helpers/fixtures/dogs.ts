import { ref } from "../../fixtures.js";

export const dogFixtureData = {
  sophie: {
    id: 1,
    trainer_id: 1,
    dog_lover_id: ref("dog_lovers", "joanna"),
  },
};
