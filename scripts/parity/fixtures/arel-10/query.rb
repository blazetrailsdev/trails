users = Arel::Table.new(:users)
users[:age].gt(10)
