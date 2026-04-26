-- Fixture for statement: ar-79
-- Query: Book.where(active: true).unscoped.order(:title)

CREATE TABLE books (
  id INTEGER PRIMARY KEY,
  title TEXT,
  active BOOLEAN
);
