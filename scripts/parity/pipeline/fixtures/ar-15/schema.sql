-- Fixture for statement: ar-15
-- Query: Book.preload(:author).limit(10)

CREATE TABLE authors (
  id INTEGER PRIMARY KEY,
  name TEXT
);
CREATE TABLE books (
  id INTEGER PRIMARY KEY,
  author_id INTEGER REFERENCES authors(id),
  title TEXT
);
