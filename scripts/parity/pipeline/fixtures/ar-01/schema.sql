-- Fixture for statement: ar-01
-- Query: Book.joins(:reviews).where("reviews.created_at > ?", 1.week.ago)

CREATE TABLE books (
  id INTEGER PRIMARY KEY,
  title TEXT,
  created_at DATETIME
);
CREATE TABLE reviews (
  id INTEGER PRIMARY KEY,
  book_id INTEGER NOT NULL REFERENCES books(id),
  body TEXT,
  created_at DATETIME
);
