import { ref } from "../define-fixtures.js";

// activerecord/test/fixtures/books.yml
export const bookFixtureData = {
  awdr: {
    author_id: ref("authors", "david"),
    name: "Agile Web Development with Rails",
    format: "paperback",
    status: 2,
    last_read: 3,
    language: 0,
    author_visibility: 0,
    illustrator_visibility: 0,
    font_size: 1,
    difficulty: 1,
    boolean_status: 1,
    cover: "soft",
  },
  rfr: {
    author_id: ref("authors", "david"),
    name: "Ruby for Rails",
    format: "ebook",
    status: 0,
    last_read: 2,
  },
  ddd: {
    author_id: ref("authors", "david"),
    name: "Domain-Driven Design",
    format: "hardcover",
    status: 2,
  },
  tlg: {
    author_id: ref("authors", "david"),
    name: "Thoughtleadering",
  },
};
