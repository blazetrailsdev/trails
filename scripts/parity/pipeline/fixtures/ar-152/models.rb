class Author < ActiveRecord::Base
  has_many :books
  has_many :published_books, -> { where(status: "published") }, class_name: "Book"
end
class Book < ActiveRecord::Base
  belongs_to :author
end
