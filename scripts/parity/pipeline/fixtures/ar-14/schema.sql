-- Fixture for statement: ar-14
-- Query: Book.includes(:author).limit(10)

CREATE TABLE authors (
  id INTEGER PRIMARY KEY,
  name TEXT
);
CREATE TABLE books (
  id INTEGER PRIMARY KEY,
  author_id INTEGER REFERENCES authors(id),
  title TEXT
);
