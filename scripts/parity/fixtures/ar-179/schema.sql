-- Fixture for statement: ar-179
-- Query: Book.where(rating: 0.0).order(:id)

CREATE TABLE books (id INTEGER PRIMARY KEY, title TEXT NOT NULL, rating REAL NOT NULL DEFAULT 0);
