Book.joins(:author).joins(:reviews).where("reviews.rating > 3")
