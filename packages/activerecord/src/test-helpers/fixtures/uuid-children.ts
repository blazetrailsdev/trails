import { ref } from "../define-fixtures.js";

// activerecord/test/fixtures/uuid_children.yml
export const uuidChildFixtureData = {
  sonny: {
    uuid_parent: ref("uuid_parents", "daddy"),
    name: "Sonny",
  },
};
