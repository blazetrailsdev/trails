import { ref } from "../define-fixtures.js";

// activerecord/test/fixtures/references.yml
export const referenceFixtureData = {
  michael_magician: {
    id: 1,
    person_id: ref("people", "michael"),
    job_id: ref("jobs", "magician"),
    favorite: false,
  },
  michael_unicyclist: {
    id: 2,
    person_id: ref("people", "michael"),
    job_id: ref("jobs", "unicyclist"),
    favorite: true,
  },
  david_unicyclist: {
    id: 3,
    person_id: ref("people", "david"),
    job_id: ref("jobs", "unicyclist"),
    favorite: false,
  },
};
