import { ref } from "../define-fixtures.js";

// activerecord/test/fixtures/memberships.yml
// YAML uses `club:` association name and ERB `joined_on` (3.weeks.ago); the
// ERB makes compare skip the file, so values are placeholders. `club:` is
// kept verbatim instead of being translated to `club_id`.
export const membershipFixtureData = {
  membership_of_boring_club: {
    joined_on: "2024-01-01 00:00:00",
    club: ref("clubs", "boring_club"),
    member_id: ref("members", "groucho"),
    favorite: false,
    type: "CurrentMembership",
  },
  membership_of_favorite_club: {
    joined_on: "2024-01-01 00:00:00",
    club: ref("clubs", "moustache_club"),
    member_id: ref("members", "groucho"),
    favorite: true,
    type: "Membership",
  },
  other_guys_membership: {
    joined_on: "2024-01-01 00:00:00",
    club: ref("clubs", "boring_club"),
    member_id: ref("members", "some_other_guy"),
    favorite: false,
    type: "CurrentMembership",
  },
  blarpy_winkup_outrageous_club: {
    joined_on: "2024-01-01 00:00:00",
    club: ref("clubs", "outrageous_club"),
    member_id: ref("members", "blarpy_winkup"),
    favorite: false,
    type: "CurrentMembership",
  },
  super_membership_of_boring_club: {
    joined_on: "2024-01-01 00:00:00",
    club: ref("clubs", "boring_club"),
    member_id: ref("members", "groucho"),
    favorite: false,
    type: "SuperMembership",
  },
  selected_membership_of_boring_club: {
    joined_on: "2024-01-01 00:00:00",
    club: ref("clubs", "boring_club"),
    member_id: ref("members", "groucho"),
    favorite: false,
    type: "SelectedMembership",
  },
};
