users = Arel::Table.new(:users)
users[:name].does_not_match_regexp('vic$')
