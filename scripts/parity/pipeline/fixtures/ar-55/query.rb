Book.joins(:author).where(authors: { name: "Rails" })
