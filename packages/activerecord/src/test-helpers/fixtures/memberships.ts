import { ref } from "../../fixtures.js";

export const membershipFixtureData = {
  membership_of_boring_club: {
    joined_on: "2024-01-01 00:00:00",
    club_id: ref("clubs", "boring_club"),
    member_id: 1,
    favorite: false,
    type: "CurrentMembership",
  },
  membership_of_favorite_club: {
    joined_on: "2024-01-01 00:00:00",
    club_id: ref("clubs", "moustache_club"),
    member_id: 1,
    favorite: true,
    type: "Membership",
  },
  other_guys_membership: {
    joined_on: "2024-01-01 00:00:00",
    club_id: ref("clubs", "boring_club"),
    member_id: 2,
    favorite: false,
    type: "CurrentMembership",
  },
  blarpy_winkup_outrageous_club: {
    joined_on: "2024-01-01 00:00:00",
    club_id: ref("clubs", "outrageous_club"),
    member_id: 3,
    favorite: false,
    type: "CurrentMembership",
  },
  super_membership_of_boring_club: {
    joined_on: "2024-01-01 00:00:00",
    club_id: ref("clubs", "boring_club"),
    member_id: 1,
    favorite: false,
    type: "SuperMembership",
  },
  selected_membership_of_boring_club: {
    joined_on: "2024-01-01 00:00:00",
    club_id: ref("clubs", "boring_club"),
    member_id: 1,
    favorite: false,
    type: "SelectedMembership",
  },
};
