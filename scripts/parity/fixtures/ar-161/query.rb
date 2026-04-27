Book.select(Arel::Nodes::Extract.new(Book.arel_table[:created_at], "year").as("pub_year"), Book.arel_table[:author_id]).group("pub_year, author_id").order("pub_year")
