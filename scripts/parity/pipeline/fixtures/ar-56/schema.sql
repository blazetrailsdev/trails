-- Fixture for statement: ar-56
-- Query: Book.where(id: 1).where(title: "Rails").unscope(where: :id)

CREATE TABLE books (
  id INTEGER PRIMARY KEY,
  title TEXT
);
