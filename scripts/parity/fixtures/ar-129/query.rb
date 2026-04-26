Book.select(Arel::Nodes::NamedFunction.new("COALESCE", [Book.arel_table[:subtitle], Book.arel_table[:title]]).as("display_title"), Book.arel_table[:id]).order(:id).limit(5)
