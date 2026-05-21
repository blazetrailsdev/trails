import { ref } from "../define-fixtures.js";

// activerecord/test/fixtures/cpk_reviews.yml
export const cpkReviewFixtureData = {
  first_book_review: {
    book_id: ref("cpk_books", "cpk_book_with_generated_pk"),
    rating: 5,
    comment: "The first book was alright.",
  },
  second_book_review_for_book_with_partial_pk_defined: {
    book_id: ref("cpk_books", "cpk_great_author_first_book"),
    author_id: ref("cpk_authors", "cpk_great_author"),
    rating: 5,
    comment: "The first book was alright.",
  },
};
