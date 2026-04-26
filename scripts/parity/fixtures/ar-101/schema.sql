-- Fixture for statement: ar-101
-- Query: Book.select(Arel.sql("books.*, COUNT(reviews.id) AS review_count")).joins("LEFT JOIN reviews ON reviews.book_id = books.id").group("books.id")

CREATE TABLE books (
  id INTEGER PRIMARY KEY,
  title TEXT
);

CREATE TABLE reviews (
  id INTEGER PRIMARY KEY,
  body TEXT,
  book_id INTEGER
);
