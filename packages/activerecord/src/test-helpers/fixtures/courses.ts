import { ref } from "../define-fixtures.js";

// activerecord/test/fixtures/courses.yml
// Rails `college: FIU` is the belongs_to association name; it sets college_id.
export const courseFixtureData = {
  ruby: {
    id: 1,
    name: "Ruby Development",
    college_id: ref("colleges", "FIU"),
  },
  java: {
    id: 2,
    name: "Java Development",
  },
};
