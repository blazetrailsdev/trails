import { ref } from "../../fixtures.js";

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
