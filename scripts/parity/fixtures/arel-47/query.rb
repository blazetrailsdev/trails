photos = Arel::Table.new(:photos)
photos.group(photos[:user_id]).having(photos[:id].count.gt(5))
