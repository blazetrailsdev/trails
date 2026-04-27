-- Fixture for statement: ar-138
-- Query: Author.where(id: Book.select(:author_id).group(:author_id).having("COUNT(*) >= 3"))

CREATE TABLE authors (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL
);

CREATE TABLE books (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  author_id INTEGER REFERENCES authors(id)
);
