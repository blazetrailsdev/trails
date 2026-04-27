-- Fixture for statement: ar-166
-- Query: Book.select("author_id, COUNT(*) AS cnt, SUM(pages) AS total").group("author_id").having("total > 500").order("total DESC")

CREATE TABLE books (id INTEGER PRIMARY KEY, title TEXT NOT NULL, author_id INTEGER, pages INTEGER NOT NULL DEFAULT 0);
