-- Fixture for statement: ar-33
-- Query: Book.select(Book.arel_table[:title].as("t"))

CREATE TABLE books (
  id INTEGER PRIMARY KEY,
  title TEXT
);
