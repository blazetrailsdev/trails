Book.select(Book.arel_table[:id], Arel::Nodes::Extract.new(Book.arel_table[:created_at], "year").as("yr")).order(Arel::Nodes::Extract.new(Book.arel_table[:created_at], "year").desc).limit(5)
