-- Fixture for statement: ar-110
-- Query: Book.joins(:reviews).where(reviews: { rating: 5 }).select("books.*, reviews.rating")

CREATE TABLE books (
  id INTEGER PRIMARY KEY,
  title TEXT
);

CREATE TABLE reviews (
  id INTEGER PRIMARY KEY,
  book_id INTEGER,
  rating INTEGER
);
