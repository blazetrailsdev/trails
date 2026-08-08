-- Fixture for statement: ar-95
-- Query: Book.where(Book.arel_table[:pages].gteq(200).and(Book.arel_table[:pages].lteq(400)))

CREATE TABLE books (
  id INTEGER PRIMARY KEY,
  title TEXT,
  pages INTEGER
);
