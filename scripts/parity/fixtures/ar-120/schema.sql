-- Fixture for statement: ar-120
-- Query: Book.joins(:reviews).where(Review.arel_table[:rating].gteq(4))

CREATE TABLE books (
  id INTEGER PRIMARY KEY,
  title TEXT
);

CREATE TABLE reviews (
  id INTEGER PRIMARY KEY,
  book_id INTEGER,
  rating INTEGER
);
