-- Fixture for statement: ar-82
-- Query: Book.optimizer_hints("SeqScan(books)").where(active: true)

CREATE TABLE books (
  id INTEGER PRIMARY KEY,
  title TEXT,
  active BOOLEAN
);
