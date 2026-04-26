-- Fixture for statement: ar-132
-- Query: Book.where(status: "draft").where(active: false).order(:title).limit(100).unscope(:limit, :order).rewhere(status: "published").order(id: :desc).limit(5)

CREATE TABLE books (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  status TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1
);
