Book.joins(:reviews).where(reviews: { rating: 5 }).select("books.*, reviews.rating")
