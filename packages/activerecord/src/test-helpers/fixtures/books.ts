import { ref } from "../define-fixtures.js";

// activerecord/test/fixtures/books.yml
export const bookFixtureData = {
  awdr: {
    id: 1,
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
    // Rails YAML carries `boolean_status: :enabled`; the Book enum maps
    // `{ enabled: true, disabled: false }`, so the stored value is a real
    // boolean. PG/MariaDB reject an integer literal in a boolean column
    // (SQLite's dynamic typing tolerated the prior `1`).
    boolean_status: true,
    cover: "soft",
  },
  rfr: {
    id: 2,
    author_id: ref("authors", "david"),
    name: "Ruby for Rails",
    format: "ebook",
    status: 0,
    last_read: 2,
  },
  ddd: {
    id: 3,
    author_id: ref("authors", "david"),
    name: "Domain-Driven Design",
    format: "hardcover",
    status: 2,
    // Rails YAML carries `last_read: "forgotten"`; the Book enum maps
    // `forgotten` to nil (`enum :last_read, { …, forgotten: nil }`), so the
    // stored value is NULL.
    last_read: null,
  },
  tlg: {
    id: 4,
    author_id: ref("authors", "david"),
    name: "Thoughtleadering",
  },
};
