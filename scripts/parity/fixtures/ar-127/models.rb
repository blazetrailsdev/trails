class Book < ActiveRecord::Base
  belongs_to :author
  has_many :reviews
end

class Author < ActiveRecord::Base
  has_many :books
end

class Review < ActiveRecord::Base
  belongs_to :book
end
