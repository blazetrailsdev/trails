-- Fixture for statement: ar-114
-- Query: Book.where(Book.arel_table[:title].does_not_match_any(["%draft%", "%archived%"]))

CREATE TABLE books (
  id INTEGER PRIMARY KEY,
  title TEXT
);
