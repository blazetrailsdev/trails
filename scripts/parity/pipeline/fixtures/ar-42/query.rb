Book.group(:author_id, :published_year).select("author_id, published_year, COUNT(*) AS c")
