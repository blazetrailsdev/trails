Book.select(Arel::Nodes::Case.new(Book.arel_table[:status]).when("active").then("yes").when("draft").then("maybe").else("no").as("is_visible"), Book.arel_table[:id]).order(:id).limit(5)
