-- Fixture for statement: ar-169
-- Query: Book.where(Book.arel_table[:pages].between(100...300)).order(:id)

CREATE TABLE books (id INTEGER PRIMARY KEY, title TEXT NOT NULL, pages INTEGER NOT NULL DEFAULT 0);
