-- Fixture for statement: ar-57
-- Query: Book.includes(:author).where("authors.name = ?", "Rails").references(:author)

CREATE TABLE authors (
  id INTEGER PRIMARY KEY,
  name TEXT
);
CREATE TABLE books (
  id INTEGER PRIMARY KEY,
  title TEXT,
  author_id INTEGER REFERENCES authors(id)
);
