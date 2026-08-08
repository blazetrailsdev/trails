-- Fixture for statement: ar-35
-- Query: Book.where(id: 1).optimizer_hints("USE_INDEX(books, idx_title)")

CREATE TABLE books (
  id INTEGER PRIMARY KEY,
  title TEXT
);
