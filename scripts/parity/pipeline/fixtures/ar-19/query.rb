User.order(:created_at).unscope(:order).where(active: true)
