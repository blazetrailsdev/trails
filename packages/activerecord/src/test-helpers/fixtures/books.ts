import { ref } from "../../fixtures.js";

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
    last_read: null,
  },
  tlg: {
    id: 4,
    author_id: ref("authors", "david"),
    name: "Thoughtleadering",
  },
};
