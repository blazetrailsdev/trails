-- Fixture for statement: ar-71
-- Query: Book.joins(:author, :reviews)

CREATE TABLE authors (
  id INTEGER PRIMARY KEY,
  name TEXT
);
CREATE TABLE books (
  id INTEGER PRIMARY KEY,
  title TEXT,
  author_id INTEGER REFERENCES authors(id)
);
CREATE TABLE reviews (
  id INTEGER PRIMARY KEY,
  book_id INTEGER REFERENCES books(id),
  body TEXT
);
