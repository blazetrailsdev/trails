-- Fixture for statement: ar-70
-- Query: Book.order(title: :desc).reorder(id: :asc)

CREATE TABLE books (
  id INTEGER PRIMARY KEY,
  title TEXT
);
