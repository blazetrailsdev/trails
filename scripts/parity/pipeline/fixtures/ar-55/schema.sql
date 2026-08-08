-- Fixture for statement: ar-55
-- Query: Book.joins(:author).where(authors: { name: "Rails" })

CREATE TABLE authors (
  id INTEGER PRIMARY KEY,
  name TEXT
);
CREATE TABLE books (
  id INTEGER PRIMARY KEY,
  title TEXT,
  author_id INTEGER REFERENCES authors(id)
);
