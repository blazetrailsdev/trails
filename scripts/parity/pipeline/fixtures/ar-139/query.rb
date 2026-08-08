Book.joins(:author).where(author: { name: "Alice" }).order("authors.id")
