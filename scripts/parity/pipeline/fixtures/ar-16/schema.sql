-- Fixture for statement: ar-16
-- Query: Book.eager_load(:author).limit(10)

CREATE TABLE authors (
  id INTEGER PRIMARY KEY,
  name TEXT
);
CREATE TABLE books (
  id INTEGER PRIMARY KEY,
  author_id INTEGER REFERENCES authors(id),
  title TEXT
);
