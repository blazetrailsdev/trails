Book.select(Arel.sql("author_id, ROUND(AVG(pages), 0) AS avg_pages")).group("author_id, avg_pages").order("avg_pages DESC")
