User.where.not(id: Comment.select(:user_id).distinct)
