-- Fixture for statement: ar-66
-- Query: Book.joins(:author).group("authors.name").select("authors.name, COUNT(*) AS c")

CREATE TABLE authors (
  id INTEGER PRIMARY KEY,
  name TEXT
);
CREATE TABLE books (
  id INTEGER PRIMARY KEY,
  title TEXT,
  author_id INTEGER REFERENCES authors(id)
);
