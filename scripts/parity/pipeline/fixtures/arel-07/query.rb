users = Arel::Table.new(:users)
users[:name].eq(nil)
