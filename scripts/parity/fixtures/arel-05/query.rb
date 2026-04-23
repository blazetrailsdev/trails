posts = Arel::Table.new(:posts)
posts[:title].as('name')
