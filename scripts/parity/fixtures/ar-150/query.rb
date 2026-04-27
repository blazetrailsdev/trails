Book.where(author: Author.where("authors.active = 1")).order(:id)
