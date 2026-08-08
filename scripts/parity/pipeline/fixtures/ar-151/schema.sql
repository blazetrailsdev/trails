-- Fixture for statement: ar-151
-- Query: Book.annotate("finding active books").optimizer_hints("SeqScan(books)").where(active: true).order(:id)

CREATE TABLE books (id INTEGER PRIMARY KEY, title TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1);
