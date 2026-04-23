users = Arel::Table.new(:users)
bots  = Arel::Table.new(:bots)
Arel::Nodes::NamedFunction.new('COALESCE', [users[:name], bots[:name]])
