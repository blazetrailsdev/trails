Book.includes(:author).where("authors.name = ?", "Rails").references(:author)
