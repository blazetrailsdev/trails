-- Fixture for statement: ar-105
-- Query: Book.where("EXISTS (SELECT 1 FROM reviews WHERE reviews.book_id = books.id AND reviews.rating > 3)")

CREATE TABLE books (
  id INTEGER PRIMARY KEY,
  title TEXT
);
CREATE TABLE reviews (
  id INTEGER PRIMARY KEY,
  book_id INTEGER REFERENCES books(id),
  rating INTEGER
);
