Book.group(Arel.sql("DATE(created_at)")).select(Arel.sql("DATE(created_at) AS pub_date"), Arel.sql("COUNT(*) AS cnt")).order(Arel.sql("pub_date"))
