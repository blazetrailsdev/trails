users = Arel::Table.new(:users)
win = Arel::Nodes::Window.new.partition(users[:name])
users[:id].count.over(win)
