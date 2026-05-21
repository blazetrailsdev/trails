import { ref } from "../define-fixtures.js";

// activerecord/test/fixtures/entrants.yml
export const entrantFixtureData = {
  first: {
    id: 1,
    course_id: ref("courses", "ruby"),
    name: "Ruby Developer",
  },
  second: {
    id: 2,
    course_id: ref("courses", "ruby"),
    name: "Ruby Guru",
  },
  third: {
    id: 3,
    course_id: ref("courses", "java"),
    name: "Java Lover",
  },
};
