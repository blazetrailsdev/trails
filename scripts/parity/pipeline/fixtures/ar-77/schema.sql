-- Fixture for statement: ar-77
-- Query: Book.group(:author_id).having(Arel.sql("COUNT(*) > 1"))

CREATE TABLE books (
  id INTEGER PRIMARY KEY,
  title TEXT,
  author_id INTEGER
);
