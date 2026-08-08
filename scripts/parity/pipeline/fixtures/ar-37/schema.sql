-- Fixture for statement: ar-37
-- Query: Book.where.associated(:author)

CREATE TABLE authors (
  id INTEGER PRIMARY KEY,
  name TEXT
);
CREATE TABLE books (
  id INTEGER PRIMARY KEY,
  title TEXT,
  author_id INTEGER REFERENCES authors(id)
);
