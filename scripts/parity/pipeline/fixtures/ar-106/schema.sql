-- Fixture for statement: ar-106
-- Query: Book.order(author_id: :asc, title: :desc)

CREATE TABLE books (
  id INTEGER PRIMARY KEY,
  title TEXT,
  author_id INTEGER
);
