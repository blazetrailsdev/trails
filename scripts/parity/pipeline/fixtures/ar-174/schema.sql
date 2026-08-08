-- Fixture for statement: ar-174
-- Query: Book.where(rating: 3.0...5.0).order(:id)

CREATE TABLE books (id INTEGER PRIMARY KEY, title TEXT NOT NULL, rating REAL NOT NULL DEFAULT 0);
