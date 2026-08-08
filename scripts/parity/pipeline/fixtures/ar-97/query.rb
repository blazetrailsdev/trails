Book.where(status: "active").or(Book.where(status: "featured"))
