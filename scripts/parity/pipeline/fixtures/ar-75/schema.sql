-- Fixture for statement: ar-75
-- Query: Book.select(Book.arel_table[:id], Book.arel_table[:title]).limit(3)

CREATE TABLE books (
  id INTEGER PRIMARY KEY,
  title TEXT
);
