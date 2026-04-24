posts = Arel::Table.new(:posts)
posts.project(posts[:id])
