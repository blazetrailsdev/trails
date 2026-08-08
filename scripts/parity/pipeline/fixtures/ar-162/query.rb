Book.select("author_id, COUNT(*) AS cnt").group("author_id").having("cnt > 2").order("cnt DESC")
