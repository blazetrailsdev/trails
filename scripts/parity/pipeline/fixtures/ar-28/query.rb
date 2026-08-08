Customer.where(last_name: "Smith").merge(Customer.where(orders_count: 5))
