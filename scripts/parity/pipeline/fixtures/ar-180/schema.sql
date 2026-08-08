-- Fixture for statement: ar-180
-- Query: Book.select(Book.arel_table[:pages].as("p"), Book.arel_table[:author_id]).where(Book.arel_table[:pages].gt(0)).order("p DESC").limit(5)

CREATE TABLE books (id INTEGER PRIMARY KEY, title TEXT NOT NULL, author_id INTEGER, pages INTEGER NOT NULL DEFAULT 0);
