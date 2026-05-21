import { ref } from "../define-fixtures.js";

// activerecord/test/fixtures/people.yml
export const personFixtureData = {
  michael: {
    id: 1,
    first_name: "Michael",
    primary_contact_id: ref("people", "david"),
    number1_fan_id: ref("people", "susan"),
    gender: "M",
    followers_count: 1,
    friends_too_count: 1,
    cars_count: 1,
  },
  david: {
    id: 2,
    first_name: "David",
    primary_contact_id: ref("people", "susan"),
    number1_fan_id: ref("people", "michael"),
    gender: "M",
    followers_count: 1,
    friends_too_count: 1,
    cars_count: 1,
  },
  susan: {
    id: 3,
    first_name: "Susan",
    primary_contact_id: ref("people", "david"),
    number1_fan_id: ref("people", "michael"),
    gender: "F",
    followers_count: 1,
    friends_too_count: 1,
  },
};
