import { ref } from "../define-fixtures.js";

// activerecord/test/fixtures/memberships.yml
// YAML uses Rails association name `club:` (resolved to `club_id` via
// belongs_to reflection) and ERB `joined_on` (3.weeks.ago). Translated to
// the FK column so the data is loadable; the ERB stamps use a static
// placeholder (compare skips this file as ERB-UNSUPPORTED regardless).
// Note: Rails schema declares `t.integer :type` even though STI writes a
// class-name string — preserved verbatim to match Rails fidelity.
export const membershipFixtureData = {
  membership_of_boring_club: {
    joined_on: "2024-01-01 00:00:00",
    club_id: ref("clubs", "boring_club"),
    member_id: ref("members", "groucho"),
    favorite: false,
    type: "CurrentMembership",
  },
  membership_of_favorite_club: {
    joined_on: "2024-01-01 00:00:00",
    club_id: ref("clubs", "moustache_club"),
    member_id: ref("members", "groucho"),
    favorite: true,
    type: "Membership",
  },
  other_guys_membership: {
    joined_on: "2024-01-01 00:00:00",
    club_id: ref("clubs", "boring_club"),
    member_id: ref("members", "some_other_guy"),
    favorite: false,
    type: "CurrentMembership",
  },
  blarpy_winkup_outrageous_club: {
    joined_on: "2024-01-01 00:00:00",
    club_id: ref("clubs", "outrageous_club"),
    member_id: ref("members", "blarpy_winkup"),
    favorite: false,
    type: "CurrentMembership",
  },
  super_membership_of_boring_club: {
    joined_on: "2024-01-01 00:00:00",
    club_id: ref("clubs", "boring_club"),
    member_id: ref("members", "groucho"),
    favorite: false,
    type: "SuperMembership",
  },
  selected_membership_of_boring_club: {
    joined_on: "2024-01-01 00:00:00",
    club_id: ref("clubs", "boring_club"),
    member_id: ref("members", "groucho"),
    favorite: false,
    type: "SelectedMembership",
  },
};
