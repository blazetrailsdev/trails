posts = Arel::Table.new(:posts)
posts[:title].matches('hell%')
