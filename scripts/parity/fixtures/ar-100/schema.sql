-- Fixture for statement: ar-100
-- Query: Book.joins('INNER JOIN authors ON authors.id = books.author_id').where("authors.name = 'Alice'")

CREATE TABLE books (
  id INTEGER PRIMARY KEY,
  title TEXT,
  author_id INTEGER
);

CREATE TABLE authors (
  id INTEGER PRIMARY KEY,
  name TEXT
);
