Book.select("author_id, COUNT(*) AS n").group("author_id").having("n > 2").order("n DESC")
