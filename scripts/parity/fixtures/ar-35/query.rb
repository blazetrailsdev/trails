Book.where(id: 1).optimizer_hints("USE_INDEX(books, idx_title)")
