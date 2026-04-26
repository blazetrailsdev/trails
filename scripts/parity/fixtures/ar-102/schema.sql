-- Fixture for statement: ar-102
-- Query: subquery = Review.select(:book_id).where("rating > 4").arel; Book.where(Book.arel_table[:id].in(subquery))

CREATE TABLE books (
  id INTEGER PRIMARY KEY,
  title TEXT
);

CREATE TABLE reviews (
  id INTEGER PRIMARY KEY,
  book_id INTEGER,
  rating INTEGER
);
