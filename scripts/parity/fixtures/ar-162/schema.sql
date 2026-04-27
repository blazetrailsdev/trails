-- Fixture for statement: ar-162
-- Query: Book.select("author_id, COUNT(*) AS cnt").group("author_id").having("cnt > 2").order("cnt DESC")

CREATE TABLE books (id INTEGER PRIMARY KEY, title TEXT NOT NULL, author_id INTEGER);
