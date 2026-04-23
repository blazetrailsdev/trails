users = Arel::Table.new(:users)
win = Arel::Nodes::Window.new.order(users[:name])
users[:id].count.over(win)
