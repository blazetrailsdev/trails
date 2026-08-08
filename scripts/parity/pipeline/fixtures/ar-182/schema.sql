-- Fixture for statement: ar-182
-- Query: ids = Book.where(status: "active").select(:id).arel.union(Book.where(status: "featured").select(:id).arel); Book.where(Book.arel_table[:id].in(ids)).order(:id)

CREATE TABLE books (id INTEGER PRIMARY KEY, title TEXT NOT NULL, status TEXT NOT NULL);
