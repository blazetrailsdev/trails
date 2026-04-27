-- Fixture for statement: ar-173
-- Query: Book.where(rating: [3.5, 4.0, 4.5]).order(:id)

CREATE TABLE books (id INTEGER PRIMARY KEY, title TEXT NOT NULL, rating REAL NOT NULL DEFAULT 0);
