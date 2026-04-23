users = Arel::Table.new(:users)
(users[:bitmap] << 1).gt(0)
