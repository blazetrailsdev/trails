users = Arel::Table.new(:users)
users[:age].sum
