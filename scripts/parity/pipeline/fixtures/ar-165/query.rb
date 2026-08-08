Book.select(Arel::Nodes::Count.new([Book.arel_table[:author_id]], true).as("distinct_authors"))
