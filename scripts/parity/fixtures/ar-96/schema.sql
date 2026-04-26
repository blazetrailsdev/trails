-- Fixture for statement: ar-96
-- Query: Book.left_outer_joins(:reviews)

CREATE TABLE books (
  id INTEGER PRIMARY KEY,
  title TEXT
);
CREATE TABLE reviews (
  id INTEGER PRIMARY KEY,
  body TEXT,
  book_id INTEGER NOT NULL REFERENCES books(id)
);
CREATE INDEX idx_reviews_book_id ON reviews(book_id);
