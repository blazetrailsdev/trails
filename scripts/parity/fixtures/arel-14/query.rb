users = Arel::Table.new(:users)
users[:name].not_in_any(%w[Mike Molly])
