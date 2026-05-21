import { ref } from "../define-fixtures.js";

// activerecord/test/fixtures/faces.yml
export const faceFixtureData = {
  trusting: {
    description: "trusting",
    human_id: ref("humans", "gordon"),
  },
  weather_beaten: {
    description: "weather beaten",
    human_id: ref("humans", "steve"),
  },
  confused: {
    description: "confused",
    polymorphic_human_id: ref("humans", "gordon"),
    polymorphic_human_type: "Human",
  },
};
