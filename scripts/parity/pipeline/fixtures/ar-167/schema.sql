-- Fixture for statement: ar-167
-- Query: Book.select(Arel.sql("author_id, ROUND(AVG(pages), 0) AS avg_pages")).group("author_id, avg_pages").order("avg_pages DESC")

CREATE TABLE books (id INTEGER PRIMARY KEY, title TEXT NOT NULL, author_id INTEGER, pages INTEGER NOT NULL DEFAULT 0);
