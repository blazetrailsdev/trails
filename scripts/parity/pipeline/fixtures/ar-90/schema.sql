-- Fixture for statement: ar-90
-- Query: Book.where(Book.arel_table[:title].does_not_match("%draft%"))

CREATE TABLE books (
  id INTEGER PRIMARY KEY,
  title TEXT
);
