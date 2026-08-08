class Employee < ActiveRecord::Base
  belongs_to :manager, class_name: "Employee", optional: true
  has_many :reports, class_name: "Employee", foreign_key: "manager_id"
end
