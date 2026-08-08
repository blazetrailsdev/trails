Book.joins(:reviews).where("reviews.created_at > ?", 1.week.ago)
