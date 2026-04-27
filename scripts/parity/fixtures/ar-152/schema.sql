-- Fixture for statement: ar-152
-- Query: Author.joins(:published_books).where("published_books.title LIKE ?", "%Rails%").select("authors.*, COUNT(published_books.id) AS book_count").group("authors.id")

CREATE TABLE authors (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
CREATE TABLE books (id INTEGER PRIMARY KEY, title TEXT NOT NULL, author_id INTEGER REFERENCES authors(id), status TEXT NOT NULL DEFAULT 'draft');
