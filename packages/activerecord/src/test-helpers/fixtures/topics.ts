import { ref } from "../define-fixtures.js";

/**
 * Canonical fixture data for the Rails `topics` table.
 * Mirrors activerecord/test/fixtures/topics.yml.
 * Use via defineFixtures(adapter, Topic, topicFixtureData).
 */
export const topicFixtureData = {
  first: {
    title: "The First Topic",
    author_name: "David",
    content: "Have a nice day",
    approved: false,
    replies_count: 1,
    type: "Topic",
  },
  second: {
    title: "The Second Topic of the day",
    author_name: "Mary",
    approved: true,
    parent_id: ref("topics", "first"),
    type: "Reply",
  },
  third: {
    title: "The Third Topic of the day",
    approved: true,
    parent_id: ref("topics", "first"),
    type: "Reply",
  },
  fourth: {
    title: "The Fourth Topic of the day",
    approved: true,
    parent_id: ref("topics", "first"),
    type: "Reply",
  },
  fifth: {
    title: "The Fifth Topic of the day",
    approved: true,
    type: "Topic",
  },
};
