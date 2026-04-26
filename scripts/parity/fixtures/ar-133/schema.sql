-- Fixture for statement: ar-133
-- Query: ranked = Book.select(Book.arel_table[Arel.star], Arel.sql("ROW_NUMBER() OVER (PARTITION BY author_id ORDER BY pages DESC) AS rn")).arel.as("ranked"); Book.from(ranked).where("ranked.rn = 1").order("ranked.id")

CREATE TABLE books (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  author_id INTEGER,
  pages INTEGER NOT NULL DEFAULT 0
);
