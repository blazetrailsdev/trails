-- Fixture for statement: ar-121
-- Query: Book.select(Book.arel_table[:id], Book.arel_table[:title], Book.arel_table[:status]).where(active: true)

CREATE TABLE books (
  id INTEGER PRIMARY KEY,
  title TEXT,
  status TEXT,
  active BOOLEAN
);
