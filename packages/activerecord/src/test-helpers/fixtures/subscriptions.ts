import { ref } from "../define-fixtures.js";

// activerecord/test/fixtures/subscriptions.yml
// subscriber_id holds the Subscriber#nick string PK directly (not a fixture
// row-name ref); book_id is numeric in Rails YAML and resolves to the
// book row carrying that id.
export const subscriptionFixtureData = {
  webster_awdr: {
    id: 1,
    subscriber_id: "webster132",
    book_id: ref("books", "awdr"),
  },
  webster_rfr: {
    id: 2,
    subscriber_id: "webster132",
    book_id: ref("books", "rfr"),
  },
  alterself_awdr: {
    id: 3,
    subscriber_id: "alterself",
    book_id: ref("books", "awdr"),
  },
};
