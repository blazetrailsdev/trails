-- Fixture for statement: ar-171
-- Query: Book.group(Arel.sql("DATE(created_at)")).select(Arel.sql("DATE(created_at) AS pub_date"), Arel.sql("COUNT(*) AS cnt")).order(Arel.sql("pub_date"))

CREATE TABLE books (id INTEGER PRIMARY KEY, title TEXT NOT NULL, created_at DATETIME);
