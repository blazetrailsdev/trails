users = Arel::Table.new(:users)
Arel::Nodes::NamedFunction.new('IF', [
  users[:name].eq(nil),
  users[:email],
  users[:name],
])
