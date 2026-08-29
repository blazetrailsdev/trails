import { ref } from "../../fixtures.js";

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
