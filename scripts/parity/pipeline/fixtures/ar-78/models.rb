module Pagination
  def per_page(n)
    limit(n)
  end
end

class Book < ActiveRecord::Base
end
