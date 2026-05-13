import { ref } from "../define-fixtures.js";

// activerecord/test/fixtures/books.yml
// Schema gap: Rails YAML also carries status, last_read, language, author_visibility,
// illustrator_visibility, font_size, difficulty, boolean_status, cover (integer enums) —
// omitted because test-fixtures.ts Book only declares name/author_id/format.
export const bookFixtureData = {
  awdr: {
    author_id: ref("authors", "david"),
    name: "Agile Web Development with Rails",
    format: "paperback",
  },
  rfr: {
    author_id: ref("authors", "david"),
    name: "Ruby for Rails",
    format: "ebook",
  },
  ddd: {
    author_id: ref("authors", "david"),
    name: "Domain-Driven Design",
    format: "hardcover",
  },
  tlg: {
    author_id: ref("authors", "david"),
    name: "Thoughtleadering",
  },
};
