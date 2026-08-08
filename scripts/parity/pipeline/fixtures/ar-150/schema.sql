-- Fixture for statement: ar-150
-- Query: Book.where(author: Author.where("authors.active = 1")).order(:id)

CREATE TABLE authors (id INTEGER PRIMARY KEY, name TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1);
CREATE TABLE books (id INTEGER PRIMARY KEY, title TEXT NOT NULL, author_id INTEGER REFERENCES authors(id));
