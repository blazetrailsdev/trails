import { ref } from "../../fixtures.js";

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
