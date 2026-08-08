-- Fixture for statement: ar-123
-- Query: Book.where.not(author_id: nil)

CREATE TABLE books (
  id INTEGER PRIMARY KEY,
  title TEXT,
  author_id INTEGER
);
