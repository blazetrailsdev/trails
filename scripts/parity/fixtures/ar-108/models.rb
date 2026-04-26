class Book < ActiveRecord::Base
  has_many :reviews
end
class Review < ActiveRecord::Base
  belongs_to :book
end
