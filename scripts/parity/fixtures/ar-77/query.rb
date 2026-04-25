Book.group(:author_id).having(Arel.sql("COUNT(*) > 1"))
