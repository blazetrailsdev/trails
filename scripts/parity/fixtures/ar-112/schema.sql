-- Fixture for statement: ar-112
-- Query: Book.where(Book.arel_table[:title].matches_any(["%rails%", "%ruby%"]))

CREATE TABLE books (
  id INTEGER PRIMARY KEY,
  title TEXT
);
