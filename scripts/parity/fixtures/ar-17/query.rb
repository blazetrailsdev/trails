Order.select("created_at as ordered_date, sum(total) as total_price").group("created_at").having("sum(total) > ?", 200)
