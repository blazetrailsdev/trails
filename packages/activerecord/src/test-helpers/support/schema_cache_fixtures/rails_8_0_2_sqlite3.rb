# Regenerate with `ruby rails_8_0_2_sqlite3.rb` (activerecord 8.0.2, sqlite3).
require "active_record"
require "tmpdir"

ActiveRecord::Base.establish_connection(adapter: "sqlite3", database: File.join(Dir.mktmpdir, "db.sqlite3"))
ActiveRecord::Schema.verbose = false
ActiveRecord::Schema.define(version: 2024_01_01_000000) do
  create_table :courses, force: true do |t|
    t.column :name, :string, null: false
    t.column :college_id, :integer, index: true
  end
end

ActiveRecord::Base.connection_pool.schema_cache.dump_to(File.join(__dir__, "rails_8_0_2_sqlite3.dump"))
