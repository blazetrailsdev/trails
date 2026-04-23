posts = Arel::Table.new(:posts)
posts.project(posts[Arel.star]).distinct
