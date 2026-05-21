import { ref } from "../define-fixtures.js";

// activerecord/test/fixtures/cpk_books.yml
export const cpkBookFixtureData = {
  cpk_great_author_first_book: {
    author_id: ref("cpk_authors", "cpk_great_author"),
    title: "The first book",
    revision: 1,
  },
  cpk_great_author_second_book: {
    author_id: ref("cpk_authors", "cpk_great_author"),
    title: "The second book",
    revision: 1,
  },
  cpk_famous_author_first_book: {
    author_id: ref("cpk_authors", "cpk_famous_author"),
    title: "Ruby on Rails",
    revision: 1,
  },
  cpk_book_with_generated_pk: {
    title: "Generated author's book",
    revision: 1,
  },
};
