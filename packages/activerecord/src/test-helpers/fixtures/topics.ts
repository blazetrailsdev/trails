import { ref } from "../define-fixtures.js";

// activerecord/test/fixtures/topics.yml
export const topicFixtureData = {
  first: {
    title: "The First Topic",
    author_name: "David",
    author_email_address: "david@loudthinking.com",
    written_on: "2003-07-16 14:28:11",
    last_read: "2004-04-15",
    bonus_time: "15:28:00",
    content: "Have a nice day",
    approved: false,
    replies_count: 1,
    type: "Topic",
  },
  second: {
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
    title: "The Third Topic of the day",
    author_name: "Carl",
    written_on: "2012-08-12 20:24:22",
    content: "I'm a troll",
    approved: true,
    replies_count: 1,
    type: "Topic",
  },
  fourth: {
    title: "The Fourth Topic of the day",
    author_name: "Carl",
    written_on: "2006-07-15 14:28:00",
    content: "Why not?",
    approved: true,
    parent_id: ref("topics", "third"),
    type: "Reply",
  },
  fifth: {
    title: "The Fifth Topic of the day",
    author_name: "Jason",
    written_on: "2013-07-13 11:11:00",
    content: "Omakase",
    approved: true,
    type: "Topic",
  },
};
