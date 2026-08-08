Order.group(:status).having("SUM(total) > ?", 200)
