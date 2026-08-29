import { ref } from "../../fixtures.js";

export const authorFavoriteFixtureData = {
  david_mary: {
    id: 1,
    author_id: ref("authors", "david"),
    favorite_author_id: ref("authors", "mary"),
  },
};
