Book.select(Arel::Nodes::Sum.new([Book.arel_table[:pages]]).as("total_pages"), Book.arel_table[:author_id]).group(:author_id).having(Arel::Nodes::Sum.new([Book.arel_table[:pages]]).gt(1000))
