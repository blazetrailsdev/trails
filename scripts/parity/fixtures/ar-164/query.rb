Book.select(Arel::Nodes::Max.new([Book.arel_table[:pages]]).as("max_pages"), Arel::Nodes::Min.new([Book.arel_table[:pages]]).as("min_pages"), Book.arel_table[:author_id]).group(:author_id)
