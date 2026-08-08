users = Arel::Table.new(:users)
(~users[:bitmap]).gt(0)
