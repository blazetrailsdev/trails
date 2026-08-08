class Author < ActiveRecord::Base; end
class Book < ActiveRecord::Base
  belongs_to :author
end
