User.with(active: User.where(active: true), admins: User.where(role: "admin")).from("active")
