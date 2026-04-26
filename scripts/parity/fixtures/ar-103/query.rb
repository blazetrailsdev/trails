Book.with(recent_books: Book.where("created_at > '2020-01-01'")).from("recent_books").select("recent_books.*")
