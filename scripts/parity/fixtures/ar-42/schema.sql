-- Fixture for statement: ar-42
-- Query: Book.group(:author_id, :published_year).select("author_id, published_year, COUNT(*) AS c")

CREATE TABLE books (
  id INTEGER PRIMARY KEY,
  title TEXT,
  author_id INTEGER,
  published_year INTEGER
);
