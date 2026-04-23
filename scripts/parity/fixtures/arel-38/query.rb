users = Arel::Table.new(:users)
Arel::Nodes::NamedFunction.new('CAST', [users[:age].as('float')])
