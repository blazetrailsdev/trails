Book.with(recent: Book.where("published_year >= ?", 2020)).from("recent AS books")
