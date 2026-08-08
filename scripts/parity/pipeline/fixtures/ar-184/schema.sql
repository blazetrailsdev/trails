-- Fixture for statement: ar-184
-- Query: Book.select("author_id, COUNT(*) AS n").group("author_id").having("n > 2").order("n DESC")

CREATE TABLE books (id INTEGER PRIMARY KEY, title TEXT NOT NULL, author_id INTEGER);
