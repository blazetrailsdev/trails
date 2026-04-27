Book.order(Arel::Nodes::NamedFunction.new("LENGTH", [Book.arel_table[:title]]).desc).limit(5)
