-- Fixture for statement: ar-170
-- Query: Book.where(rating: 3.5..5.0).order(:id)

CREATE TABLE books (id INTEGER PRIMARY KEY, title TEXT NOT NULL, rating REAL NOT NULL DEFAULT 0);
