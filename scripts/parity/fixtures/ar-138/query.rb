Author.where(id: Book.select(:author_id).group(:author_id).having("COUNT(*) >= 3"))
