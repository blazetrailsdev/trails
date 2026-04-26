-- Fixture for statement: ar-88
-- Query: Book.select(Book.arel_table[:title].as("book_title"), Book.arel_table[:id])

CREATE TABLE books (
  id INTEGER PRIMARY KEY,
  title TEXT
);
