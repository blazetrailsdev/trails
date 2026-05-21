import { ref } from "../define-fixtures.js";

// activerecord/test/fixtures/peoples_treasures.yml
export const peoplesTreasuresFixtureData = {
  michael_diamond: {
    rich_person_id: ref("people", "michael"),
    treasure_id: ref("treasures", "diamond"),
  },
};
