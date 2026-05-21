import { ref } from "../define-fixtures.js";

// activerecord/test/fixtures/members.yml
export const memberFixtureData = {
  groucho: {
    id: 1,
    name: "Groucho Marx",
    member_type_id: ref("member_types", "founding"),
  },
  some_other_guy: {
    id: 2,
    name: "Englebert Humperdink",
    member_type_id: ref("member_types", "provisional"),
  },
  blarpy_winkup: {
    id: 3,
    name: "Blarpy Winkup",
  },
};
