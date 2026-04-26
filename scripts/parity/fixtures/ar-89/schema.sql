-- Fixture for statement: ar-89
-- Query: Book.where(Book.arel_table[:title].matches("%rails%"))

CREATE TABLE books (
  id INTEGER PRIMARY KEY,
  title TEXT
);
