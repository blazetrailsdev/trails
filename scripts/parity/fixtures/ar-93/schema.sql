-- Fixture for statement: ar-93
-- Query: Book.select(:author_id, Arel.sql("COUNT(*) AS book_count")).group(:author_id).having(Arel.sql("COUNT(*) > 2"))

CREATE TABLE books (
  id INTEGER PRIMARY KEY,
  title TEXT,
  author_id INTEGER
);
