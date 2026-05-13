import { ref } from "../define-fixtures.js";

// activerecord/test/fixtures/books.yml
// Schema gap: Rails YAML also carries status, last_read, language, author_visibility,
// illustrator_visibility, font_size, difficulty, boolean_status, cover (integer enums) —
// omitted because test-fixtures.ts Book only declares name/author_id/format.
export const bookFixtureData = {
  awdr: {
    id: 1,
    author_id: ref("authors", "david"),
    name: "Agile Web Development with Rails",
    format: "paperback",
  },
  rfr: {
    id: 2,
    author_id: ref("authors", "david"),
    name: "Ruby for Rails",
    format: "ebook",
  },
  ddd: {
    id: 3,
    author_id: ref("authors", "david"),
    name: "Domain-Driven Design",
    format: "hardcover",
  },
  tlg: {
    id: 4,
    author_id: ref("authors", "david"),
    name: "Thoughtleadering",
  },
};
