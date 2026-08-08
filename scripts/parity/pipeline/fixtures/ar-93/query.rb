Book.select(:author_id, Arel.sql("COUNT(*) AS book_count")).group(:author_id).having(Arel.sql("COUNT(*) > 2"))
