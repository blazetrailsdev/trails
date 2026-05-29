import { ref } from "../define-fixtures.js";

// activerecord/test/fixtures/topics.yml
//
// STI `type` is only set on the Reply rows (second, fourth); base-class
// Topic rows leave it NULL, matching Rails which omits `type:` entirely
// for them.
export const topicFixtureData = {
  first: {
    id: 1,
    title: "The First Topic",
    author_name: "David",
    author_email_address: "david@loudthinking.com",
    written_on: "2003-07-16 14:28:11",
    last_read: "2004-04-15",
    bonus_time: "14:28:00",
    content: "Have a nice day",
    approved: false,
    replies_count: 1,
  },
  second: {
    id: 2,
    title: "The Second Topic of the day",
    author_name: "Mary",
    written_on: "2004-07-15 14:28:00",
    content: "Have a nice day",
    approved: true,
    replies_count: 0,
    parent_id: ref("topics", "first"),
    type: "Reply",
  },
  third: {
    id: 3,
    title: "The Third Topic of the day",
    author_name: "Carl",
    written_on: "2012-08-12 20:24:22",
    content: "I'm a troll",
    approved: true,
    replies_count: 1,
  },
  fourth: {
    id: 4,
    title: "The Fourth Topic of the day",
    author_name: "Carl",
    written_on: "2006-07-15 14:28:00",
    content: "Why not?",
    approved: true,
    parent_id: ref("topics", "third"),
    type: "Reply",
  },
  fifth: {
    id: 5,
    title: "The Fifth Topic of the day",
    author_name: "Jason",
    written_on: "2013-07-13 11:11:00",
    content: "Omakase",
    approved: true,
  },
};
