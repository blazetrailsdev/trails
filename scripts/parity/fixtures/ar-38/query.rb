User.where(id: Comment.select(:user_id).where(approved: true))
