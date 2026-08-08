-- Fixture for statement: ar-104
-- Query: Author.joins(:books).select("authors.*, COUNT(books.id) AS books_count").group("authors.id")

CREATE TABLE authors (
  id INTEGER PRIMARY KEY,
  name TEXT
);
CREATE TABLE books (
  id INTEGER PRIMARY KEY,
  title TEXT,
  author_id INTEGER REFERENCES authors(id)
);
