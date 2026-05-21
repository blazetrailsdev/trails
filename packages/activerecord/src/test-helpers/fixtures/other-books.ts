// activerecord/test/fixtures/other_books.yml
// Rails sets `_fixture: model_class: Book` and ignores the PUBLISHED*
// YAML-anchor rows; only `awdr` and `rfr` materialize. Enum symbols expanded
// to the integer values from books.ts (status :published = 2, language
// :english = 0).
export const otherBookFixtureData = {
  awdr: {
    status: 2,
    format: "paperback",
    language: 0,
    name: "Agile Web Development with Rails",
  },
  rfr: {
    status: 2,
    format: "ebook",
    name: "Ruby for Rails",
  },
};
