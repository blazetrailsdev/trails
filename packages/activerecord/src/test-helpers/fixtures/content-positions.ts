import { ref } from "../define-fixtures.js";

// activerecord/test/fixtures/content_positions.yml
export const contentPositionFixtureData = {
  content_positions: {
    id: 1,
    content_id: ref("content", "content"),
  },
};
