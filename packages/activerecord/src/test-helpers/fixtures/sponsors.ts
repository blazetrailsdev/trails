import { ref } from "../define-fixtures.js";

// activerecord/test/fixtures/sponsors.yml
// Rails YAML uses the association name `sponsor_club:` (belongs_to
// :sponsor_club, class_name: "Club", foreign_key: "club_id"); translated
// to the underlying FK column for loadability. `sponsorable` is
// polymorphic — `sponsorable_id` resolves via ref to the row in the
// table implied by `sponsorable_type`.
export const sponsorFixtureData = {
  moustache_club_sponsor_for_groucho: {
    club_id: ref("clubs", "moustache_club"),
    sponsorable_id: ref("members", "groucho"),
    sponsorable_type: "Member",
  },
  boring_club_sponsor_for_groucho: {
    club_id: ref("clubs", "boring_club"),
    sponsorable_id: ref("members", "some_other_guy"),
    sponsorable_type: "Member",
  },
  outrageous_club_sponsor_for_groucho: {
    club_id: ref("clubs", "outrageous_club"),
    sponsorable_id: ref("members", "blarpy_winkup"),
    sponsorable_type: "Member",
  },
  sponsor_for_author_david: {
    sponsorable_id: ref("authors", "david"),
    sponsorable_type: "Author",
  },
};
