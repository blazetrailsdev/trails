-- Fixture for statement: ar-139
-- Query: Book.joins(:author).where(author: { name: "Alice" }).order("authors.id")

CREATE TABLE authors (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL
);

CREATE TABLE books (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  author_id INTEGER REFERENCES authors(id)
);
