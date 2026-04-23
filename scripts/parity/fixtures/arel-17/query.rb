users = Arel::Table.new(:users)
users[:name].is_distinct_from('Bob')
