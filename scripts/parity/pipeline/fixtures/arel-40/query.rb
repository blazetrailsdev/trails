posts = Arel::Table.new(:posts)
Arel::Nodes::NamedFunction.new('DATE_FORMAT', [
  posts[:created_at],
  Arel::Nodes::Quoted.new('%Y%m'),
])
