-- Fixture for statement: ar-134
-- Query: Author.joins(books: :reviews).select("authors.id, authors.name, COUNT(reviews.id) AS total_reviews").group("authors.id, authors.name")

CREATE TABLE authors (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL
);

CREATE TABLE books (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  author_id INTEGER REFERENCES authors(id)
);

CREATE TABLE reviews (
  id INTEGER PRIMARY KEY,
  book_id INTEGER REFERENCES books(id),
  rating INTEGER NOT NULL
);
