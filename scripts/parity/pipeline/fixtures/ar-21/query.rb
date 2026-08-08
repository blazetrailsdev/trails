posts = Post.arel_table
User.where(Post.where(posts[:user_id].eq(User.arel_table[:id])).arel.exists.not)
