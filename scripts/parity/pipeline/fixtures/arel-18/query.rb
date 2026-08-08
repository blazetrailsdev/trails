users = Arel::Table.new(:users)
bots  = Arel::Table.new(:bots)
users[:name].eq(bots[:name])
