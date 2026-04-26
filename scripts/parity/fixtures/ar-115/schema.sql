-- Fixture for statement: ar-115
-- Query: Author.joins(:books).group("authors.id").having("COUNT(books.id) >= 2")

CREATE TABLE authors (
  id INTEGER PRIMARY KEY,
  name TEXT
);

CREATE TABLE books (
  id INTEGER PRIMARY KEY,
  title TEXT,
  author_id INTEGER REFERENCES authors(id)
);
