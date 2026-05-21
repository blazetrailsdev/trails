import { ref } from "../define-fixtures.js";

// activerecord/test/fixtures/cpk_reviews.yml
//
// Rails YAML uses the `book:` belongs_to shorthand; Cpk::Review declares
// `belongs_to :book, foreign_key: [:author_id, :number]`, so Rails populates
// the composite FK columns `author_id` + `number` (no `book_id` column
// exists). Mirror that here directly.
export const cpkReviewFixtureData = {
  first_book_review: {
    number: ref("cpk_books", "cpk_book_with_generated_pk"),
    rating: 5,
    comment: "The first book was alright.",
  },
  second_book_review_for_book_with_partial_pk_defined: {
    author_id: ref("cpk_authors", "cpk_great_author"),
    number: ref("cpk_books", "cpk_great_author_first_book"),
    rating: 5,
    comment: "The first book was alright.",
  },
};
