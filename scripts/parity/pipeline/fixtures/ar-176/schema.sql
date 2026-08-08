-- Fixture for statement: ar-176
-- Query: Book.where(rating: 4.0).order(:id)

CREATE TABLE books (id INTEGER PRIMARY KEY, title TEXT NOT NULL, rating REAL NOT NULL DEFAULT 0);
