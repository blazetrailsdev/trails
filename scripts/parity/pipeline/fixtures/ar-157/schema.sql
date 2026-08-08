-- Fixture for statement: ar-157
-- Query: query1 = Book.where(status: "active").arel; query2 = Book.where(status: "featured").arel; Book.from(query1.union(query2).as("all_books")).select("all_books.*").order("all_books.id")

CREATE TABLE books (id INTEGER PRIMARY KEY, title TEXT NOT NULL, status TEXT NOT NULL);
