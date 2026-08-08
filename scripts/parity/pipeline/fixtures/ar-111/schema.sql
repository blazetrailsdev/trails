-- Fixture for statement: ar-111
-- Query: Book.select(:author_id).distinct.order(author_id: :asc)

CREATE TABLE books (
  id INTEGER PRIMARY KEY,
  title TEXT,
  author_id INTEGER
);
