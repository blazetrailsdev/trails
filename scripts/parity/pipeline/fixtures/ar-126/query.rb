Book.order(Arel.sql("CASE WHEN status = 'featured' THEN 0 ELSE 1 END"))
