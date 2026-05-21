import { ref } from "../define-fixtures.js";

// activerecord/test/fixtures/clubs.yml
export const clubFixtureData = {
  boring_club: {
    name: "Banana appreciation society",
    category_id: ref("categories", "general"),
  },
  moustache_club: {
    name: "Moustache and Eyebrow Fancier Club",
  },
  outrageous_club: {
    name: "Skull and bones",
    category_id: ref("categories", "technology"),
  },
};
