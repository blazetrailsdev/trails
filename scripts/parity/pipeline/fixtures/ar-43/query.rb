Book.where("title = :t AND id > :min", t: "Rails", min: 5)
