users = Arel::Table.new(:users)
(users[:bitmap] ^ 16).gt(0)
