-- Fixture for statement: ar-43
-- Query: Book.where("title = :t AND id > :min", t: "Rails", min: 5)

CREATE TABLE books (
  id INTEGER PRIMARY KEY,
  title TEXT
);
