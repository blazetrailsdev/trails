// Mirror of vendor/rails/activerecord/test/schema/schema.rb.
//
// Single canonical schema declaration for the AR fixture port (see
// docs/fixtures-port-plan.md). Tables appear in the same order as the
// Rails source (which is broadly — but not strictly — alphabetical;
// e.g. `paragraphs` sits inside the `cpk_*` block). Built incrementally
// across PRs 0.5a..0.5h; the wire-up into setup-adapter-suite happens
// in the final split.
//
// Features Rails' schema.rb expresses that defineSchema cannot yet
// express (deliberately dropped during the port — fixture-row tests
// don't depend on them):
//   - secondary indexes / expression indexes
//   - foreign-key constraints (add_foreign_key)
//   - SQL function defaults (e.g. CURRENT_TIMESTAMP via -> {})
//   - identifier-length stress columns (t.string "a" * max_identifier_length)
//   - polymorphic helper (modeled directly as `<name>_id` + `<name>_type`)

import type { Schema } from "./define-schema.js";

/**
 * PR 0.5a group: alphabetical range "1_need_quoting".."bulbs" (covers
 * digits, A-tables, and the leading B-tables). Sibling PRs 0.5b..0.5h
 * append the remaining groups to this same object.
 *
 * Tables declared as an empty `{}` mirror Rails `create_table :x do |t| end`
 * — `defineSchema` (and Rails) creates the table with only the implicit
 * primary-key column. Use `{ columns: {...}, primaryKey: false }` for a
 * genuinely id-less table.
 */
export const TEST_SCHEMA: Schema = {
  "1_need_quoting": {
    name: "string",
  },

  accounts: {
    firm_id: "integer",
    firm_name: "string",
    credit_limit: "integer",
    status: "string",
    updated_at: "datetime",
  },

  admin_accounts: {
    name: "string",
  },

  admin_users: {
    name: "string",
    settings: { type: "string", null: true, limit: 1024 },
    parent: { type: "string", null: true, limit: 1024 },
    spouse: { type: "string", null: true, limit: 1024 },
    configs: { type: "string", null: true, limit: 1024 },
    // MySQL does not allow defaults on blobs; Rails fakes it with a large
    // varchar, mirrored here.
    preferences: { type: "string", null: true, default: "", limit: 1024 },
    json_data: { type: "string", null: true, limit: 1024 },
    json_data_empty: { type: "string", null: true, default: "", limit: 1024 },
    params: "text",
    account_id: "integer",
    json_options: "json",
  },

  admin_user_jsons: {
    name: "string",
    settings: { type: "string", null: true, limit: 1024 },
    parent: { type: "string", null: true, limit: 1024 },
    spouse: { type: "string", null: true, limit: 1024 },
    configs: { type: "string", null: true, limit: 1024 },
    preferences: { type: "string", null: true, default: "", limit: 1024 },
    json_data: { type: "string", null: true, limit: 1024 },
    json_data_empty: { type: "string", null: true, default: "", limit: 1024 },
    params: "text",
    account_id: "integer",
  },

  aircraft: {
    name: "string",
    wheels_count: { type: "integer", default: 0, null: false },
    wheels_owned_at: "datetime",
    // Rails uses CURRENT_TIMESTAMP as the default; defineSchema does not
    // yet support SQL function defaults — column kept, default dropped.
    manufactured_at: "datetime",
  },

  articles: {},

  articles_magazines: {
    article_id: "integer",
    magazine_id: "integer",
  },

  articles_tags: {
    article_id: "integer",
    tag_id: "integer",
  },

  attachments: {
    // Polymorphic reference expanded:
    record_id: { type: "integer", null: false },
    record_type: { type: "string", null: false },
  },

  audit_logs: {
    message: { type: "string", null: false },
    developer_id: { type: "integer", null: false },
    unvalidated_developer_id: "integer",
  },

  author_addresses: {},

  authors: {
    name: { type: "string", null: false },
    author_address_id: "integer",
    author_address_extra_id: "integer",
    organization_id: "string",
    owned_essay_id: "string",
  },

  author_favorites: {
    author_id: "integer",
    favorite_author_id: "integer",
  },

  auto_id_tests: {
    columns: {
      auto_id: "integer",
      value: "integer",
      // Rails default: CURRENT_TIMESTAMP — see note at top of file.
      published_at: "datetime",
    },
    primaryKey: ["auto_id"],
  },

  binaries: {
    name: "string",
    data: "binary",
    short_data: { type: "binary", limit: 2048 },
    // Rails uses t.blob; mirrors as binary across our supported adapters.
    blob_data: "binary",
  },

  birds: {
    name: "string",
    color: "string",
    pirate_id: "integer",
  },

  // Rails declares `id: :integer` (narrower than the default bigint).
  // defineSchema currently emits the adapter-default PK type; fixture row
  // ids fit either width, so the override is dropped.
  books: {
    author_id: "integer",
    format: "string",
    format_record_id: "integer",
    format_record_type: "string",
    name: "string",
    status: { type: "integer", default: 0 },
    last_read: { type: "integer", default: 0 },
    nullable_status: "integer",
    language: { type: "integer", default: 0 },
    author_visibility: { type: "integer", default: 0 },
    illustrator_visibility: { type: "integer", default: 0 },
    font_size: { type: "integer", default: 0 },
    difficulty: { type: "integer", default: 0 },
    cover: { type: "string", default: "hard" },
    isbn: "string",
    external_id: "string",
    original_name: "string",
    published_on: "datetime",
    boolean_status: "boolean",
    tags_count: { type: "integer", default: 0 },
    created_at: "datetime",
    updated_at: "datetime",
    updated_on: "date",
  },

  encrypted_books: {
    author_id: "integer",
    format: "string",
    name: { type: "string", default: "<untitled>", limit: 1024 },
    original_name: "string",
    logo: "binary",
    created_at: "datetime",
    updated_at: "datetime",
  },

  hardbacks: {},

  booleans: {
    value: "boolean",
    has_fun: { type: "boolean", null: false, default: false },
  },

  branches: {
    branch_id: "integer",
  },

  bulbs: {
    columns: {
      ID: "integer",
      car_id: "integer",
      name: "string",
      frickinawesome: { type: "boolean", default: false },
      color: "string",
    },
    primaryKey: ["ID"],
  },

  CamelCase: {
    name: "string",
  },

  cars: {
    person_id: "integer",
    name: "string",
    engines_count: "integer",
    wheels_count: { type: "integer", default: 0, null: false },
    wheels_owned_at: "datetime",
    bulbs_count: "integer",
    custom_tyres_count: "integer",
    lock_version: { type: "integer", null: false, default: 0 },
    created_at: { type: "datetime", null: false },
    updated_at: { type: "datetime", null: false },
  },

  // Rails declares `id: :integer`; defineSchema's default bigint PK is
  // wider but accepts the same integer values fixtures emit.
  old_cars: {},

  carriers: {},

  carts: {
    columns: {
      shop_id: "big_integer",
      id: { type: "big_integer", null: false },
      title: "string",
    },
    primaryKey: ["shop_id", "id"],
  },

  categories: {
    name: { type: "string", null: false },
    type: "string",
    categorizations_count: "integer",
  },

  categories_posts: {
    category_id: { type: "integer", null: false },
    post_id: { type: "integer", null: false },
  },

  categorizations: {
    category_id: "integer",
    named_category_name: "string",
    post_id: "integer",
    author_id: "integer",
    special: "boolean",
  },

  citations: {
    book1_id: "integer",
    book2_id: "integer",
    citation_id: "integer",
  },

  cpk_books: {
    columns: {
      author_id: "integer",
      id: "integer",
      title: "string",
      revision: "integer",
      order_id: "integer",
      shop_id: "integer",
    },
    primaryKey: ["author_id", "id"],
  },

  cpk_chapters: {
    columns: {
      author_id: "integer",
      id: "integer",
      book_id: "integer",
      title: "string",
    },
    primaryKey: ["author_id", "id"],
  },

  cpk_authors: {
    name: "string",
  },

  cpk_posts: {
    columns: {
      title: "string",
      author: "string",
    },
    primaryKey: ["title", "author"],
  },

  cpk_comments: {
    commentable_title: "string",
    commentable_author: "string",
    commentable_type: "string",
    text: "text",
  },

  cpk_reviews: {
    author_id: "integer",
    number: "integer",
    rating: "integer",
    comment: "string",
  },

  // Composite PK is configured on the model level; the DB table keeps the
  // default autoincrement `id` so order rows still get one.
  cpk_orders: {
    shop_id: "integer",
    status: "string",
    books_count: { type: "integer", default: 0 },
  },

  cpk_order_tags: {
    columns: {
      order_id: "integer",
      tag_id: "integer",
      attached_by: "string",
      attached_reason: "string",
    },
    primaryKey: ["order_id", "tag_id"],
  },

  cpk_tags: {
    name: { type: "string", null: false },
  },

  cpk_order_agreements: {
    order_id: "integer",
    signature: "string",
  },

  cpk_cars: {
    columns: {
      make: { type: "string", null: false },
      model: { type: "string", null: false },
    },
    primaryKey: ["make", "model"],
  },

  cpk_car_reviews: {
    car_make: { type: "string", null: false },
    car_model: { type: "string", null: false },
    comment: "text",
    rating: "integer",
  },

  paragraphs: {
    book_id: "integer",
  },

  clothing_items: {
    clothing_type: "string",
    color: "string",
    type: "string",
    size: "string",
    description: "text",
  },

  sharded_blogs: {
    name: "string",
  },

  sharded_blog_posts: {
    title: "string",
    parent_id: "integer",
    parent_type: "string",
    blog_id: "integer",
    revision: "integer",
  },

  sharded_comments: {
    body: "string",
    blog_post_id: "integer",
    blog_id: "integer",
  },

  sharded_tags: {
    name: "string",
    blog_id: "integer",
  },

  sharded_blog_posts_tags: {
    blog_id: "integer",
    blog_post_id: "integer",
    tag_id: "integer",
  },

  clubs: {
    name: "string",
    category_id: "integer",
  },

  collections: {
    name: "string",
  },

  colnametests: {
    references: { type: "integer", null: false },
  },

  columns: {
    record_id: "integer",
  },

  comments: {
    post_id: { type: "integer", null: false },
    body: { type: "text", null: false },
    type: "string",
    label: { type: "integer", default: 0 },
    tags_count: { type: "integer", default: 0 },
    children_count: { type: "integer", default: 0 },
    parent_id: "integer",
    author_id: "integer",
    author_type: "string",
    // Rails comment: kept as string so preload works when types don't match.
    resource_id: "string",
    resource_type: "string",
    origin_id: "integer",
    origin_type: "string",
    developer_id: "integer",
    updated_at: "datetime",
    deleted_at: "datetime",
    comments: "integer",
    company: "integer",
  },

  comment_overlapping_counter_caches: {
    user_comments_count_id: "integer",
    post_comments_count_id: "integer",
    commentable_id: "integer",
    commentable_type: "string",
  },

  companies: {
    type: "string",
    firm_id: "integer",
    firm_name: "string",
    name: "string",
    client_of: "big_integer",
    rating: { type: "big_integer", default: 1 },
    account_id: "integer",
    description: { type: "string", default: "" },
    status: { type: "integer", default: 0 },
  },

  content: {
    title: "string",
    book_id: "integer",
    book_destroy_async_id: "integer",
  },

  content_positions: {
    content_id: "integer",
  },

  vegetables: {
    name: "string",
    seller_id: "integer",
    custom_type: "string",
  },

  computers: {
    system: "string",
    developer: { type: "integer", null: false },
    extendedWarranty: { type: "integer", null: false },
    timezone: "integer",
    created_at: "datetime",
    updated_at: "datetime",
  },

  // Rails declares `id: false` — pure join table, no synthetic PK.
  computers_developers: {
    columns: {
      computer_id: "integer",
      developer_id: "integer",
      created_at: "datetime",
      updated_at: "datetime",
    },
    primaryKey: false,
  },

  // PR 0.5c group: C-stragglers (contracts..customer_carriers), D-tables
  // (dashboards..doubloons), E-tables (edges..eyes), F-tables
  // (families..friendships, plus the `cold_jokes` row Rails sandwiches in
  // the F block), and G-tables (goofy_string_id..guitars, plus the
  // `having` row Rails sandwiches between goofy_string_id and guids).

  contracts: {
    developer_id: "integer",
    company_id: "integer",
    metadata: "string",
    count: "integer",
  },

  customers: {
    name: "string",
    balance: { type: "integer", default: 0 },
    address_street: "string",
    address_city: "string",
    address_country: "string",
    gps_location: "string",
  },

  customer_carriers: {
    customer_id: "integer",
    carrier_id: "integer",
  },

  // Rails declares `id: false` with a string `dashboard_id` column — the
  // model treats `dashboard_id` as the PK at the AR layer.
  dashboards: {
    columns: {
      dashboard_id: "string",
      name: "string",
    },
    primaryKey: false,
  },

  destroy_async_parents: {
    columns: {
      parent_id: "integer",
      name: "string",
      tags_count: { type: "integer", default: 0 },
    },
    primaryKey: ["parent_id"],
  },

  destroy_async_parent_soft_deletes: {
    tags_count: { type: "integer", default: 0 },
    deleted: "boolean",
  },

  discounts: {
    amount: "integer",
  },

  dl_keyed_belongs_tos: {
    columns: {
      belongs_key: "integer",
      destroy_async_parent_id: "integer",
    },
    primaryKey: ["belongs_key"],
  },

  dl_keyed_belongs_to_soft_deletes: {
    destroy_async_parent_soft_delete_id: "integer",
    deleted: "boolean",
  },

  dl_keyed_has_ones: {
    columns: {
      has_one_key: "integer",
      destroy_async_parent_id: "integer",
      destroy_async_parent_soft_delete_id: "integer",
    },
    primaryKey: ["has_one_key"],
  },

  dl_keyed_has_manies: {
    columns: {
      many_key: "integer",
      destroy_async_parent_id: "integer",
    },
    primaryKey: ["many_key"],
  },

  dl_keyed_has_many_throughs: {
    columns: {
      through_key: "integer",
    },
    primaryKey: ["through_key"],
  },

  dl_keyed_joins: {
    columns: {
      joins_key: "integer",
      destroy_async_parent_id: "integer",
      dl_keyed_has_many_through_id: "integer",
    },
    primaryKey: ["joins_key"],
  },

  developers: {
    name: "string",
    first_name: "string",
    salary: { type: "integer", default: 70000 },
    firm_id: "integer",
    mentor_id: "integer",
    legacy_created_at: "datetime",
    legacy_updated_at: "datetime",
    legacy_created_on: "datetime",
    legacy_updated_on: "datetime",
  },

  // Rails declares `id: false` — pure join table, no synthetic PK.
  developers_projects: {
    columns: {
      developer_id: { type: "integer", null: false },
      project_id: { type: "integer", null: false },
      joined_on: "date",
      access_level: { type: "integer", default: 1 },
    },
    primaryKey: false,
  },

  dog_lovers: {
    trained_dogs_count: { type: "integer", default: 0 },
    bred_dogs_count: { type: "integer", default: 0 },
    dogs_count: { type: "integer", default: 0 },
  },

  dogs: {
    trainer_id: "integer",
    breeder_id: "integer",
    dog_lover_id: "integer",
    alias: "string",
  },

  doubloons: {
    pirate_id: "integer",
    weight: "integer",
  },

  // Rails declares `id: false`; unique index on [source_id, sink_id] is
  // dropped per the secondary-index note at the top of this file.
  edges: {
    columns: {
      source_id: { type: "integer", null: false },
      sink_id: { type: "integer", null: false },
    },
    primaryKey: false,
  },

  editorships: {
    publication_id: "string",
    editor_id: "string",
  },

  editors: {
    name: "string",
  },

  engines: {
    car_id: "integer",
  },

  entrants: {
    name: { type: "string", null: false },
    course_id: { type: "integer", null: false },
  },

  entries: {
    // Polymorphic reference expanded:
    entryable_type: { type: "string", null: false },
    entryable_id: { type: "integer", null: false },
    account_id: { type: "integer", null: false },
    updated_at: "datetime",
  },

  essays: {
    type: "string",
    name: "string",
    writer_id: "string",
    writer_type: "string",
    category_id: "string",
    author_id: "string",
    book_id: "integer",
  },

  events: {
    title: { type: "string", limit: 5 },
  },

  eyes: {},

  families: {},

  family_trees: {
    family_id: "integer",
    member_id: "integer",
    token: "string",
  },

  frogs: {
    name: "string",
  },

  funny_jokes: {
    name: "string",
  },

  // Rails declares `cold_jokes` between funny_jokes and friendships.
  cold_jokes: {
    cold_name: "string",
  },

  friendships: {
    friend_id: "integer",
    follower_id: "integer",
  },

  // Rails declares `id: false` with an explicit `t.string :id, null: false`
  // column — no DB-level PK constraint. The model promotes `id` to PK at
  // the AR layer via `self.primary_key = "id"`, same shape as `dashboards`.
  goofy_string_id: {
    columns: {
      id: { type: "string", null: false },
      info: "string",
    },
    primaryKey: false,
  },

  // Rails declares `having` between goofy_string_id and guids.
  having: {
    where: "string",
  },

  guids: {
    key: "string",
  },

  guitars: {
    color: "string",
  },

  notifications: {
    message: "string",
  },

  // Rails declares precision/scale on each decimal/numeric column; the
  // current Schema shape doesn't carry those, so we drop them (per the
  // header note on features defineSchema doesn't express yet).
  numeric_data: {
    bank_balance: "decimal",
    big_bank_balance: "decimal",
    unscaled_bank_balance: "decimal",
    world_population: "decimal",
    my_house_population: "decimal",
    decimal_number: "decimal",
    decimal_number_with_default: { type: "decimal", default: 2.78 },
    numeric_number: "decimal",
    temperature: "float",
    temperature_with_limit: { type: "float", limit: 24 },
    decimal_number_big_precision: "decimal",
    atoms_in_universe: "decimal",
  },

  orders: {
    name: "string",
    billing_customer_id: "integer",
    shipping_customer_id: "integer",
  },

  organizations: {
    name: "string",
  },

  owners: {
    columns: {
      owner_id: "integer",
      name: "string",
      updated_at: "datetime",
      happy_at: "datetime",
      essay_id: "string",
    },
    primaryKey: ["owner_id"],
  },

  paint_colors: {
    non_poly_one_id: "integer",
  },

  paint_textures: {
    non_poly_two_id: "integer",
  },

  parrots: {
    name: "string",
    breed: { type: "integer", default: 0 },
    color: "string",
    parrot_sti_class: "string",
    killer_id: "integer",
    updated_count: { type: "integer", default: 0 },
    created_at: "datetime",
    created_on: "datetime",
    updated_at: "datetime",
    updated_on: "datetime",
  },

  pirates: {
    catchphrase: "string",
    parrot_id: "integer",
    non_validated_parrot_id: "integer",
    created_on: "datetime",
    updated_on: "datetime",
  },

  treasures: {
    name: "string",
    type: "string",
    looter_id: "integer",
    looter_type: "string",
    ship_id: "integer",
  },

  parrots_pirates: {
    columns: {
      parrot_id: "integer",
      pirate_id: "integer",
    },
    primaryKey: false,
  },

  parrots_treasures: {
    columns: {
      parrot_id: "integer",
      treasure_id: "integer",
    },
    primaryKey: false,
  },

  parrot_treasures: {
    columns: {
      parrot_id: "integer",
      treasure_id: "integer",
    },
    primaryKey: false,
  },

  people: {
    first_name: { type: "string", null: false },
    primary_contact_id: "integer",
    gender: { type: "string", limit: 1 },
    number1_fan_id: "integer",
    lock_version: { type: "integer", null: false, default: 0 },
    comments: "string",
    followers_count: { type: "integer", default: 0 },
    friends_too_count: { type: "integer", default: 0 },
    best_friend_id: "integer",
    best_friend_of_id: "integer",
    insures: { type: "integer", null: false, default: 0 },
    born_at: "datetime",
    cars_count: { type: "integer", default: 0 },
    created_at: { type: "datetime", null: false },
    updated_at: { type: "datetime", null: false },
  },

  peoples_treasures: {
    columns: {
      rich_person_id: "integer",
      treasure_id: "integer",
    },
    primaryKey: false,
  },

  personal_legacy_things: {
    tps_report_number: "integer",
    person_id: "integer",
    version: { type: "integer", null: false, default: 0 },
  },

  pets: {
    columns: {
      pet_id: "integer",
      name: "string",
      owner_id: "integer",
      created_at: "datetime",
      updated_at: "datetime",
    },
    primaryKey: ["pet_id"],
  },

  pets_treasures: {
    treasure_id: "integer",
    pet_id: "integer",
    rainbow_color: "string",
  },

  posts: {
    author_id: "integer",
    title: { type: "string", null: false },
    body: { type: "text", null: false },
    type: "string",
    legacy_comments_count: { type: "integer", default: 0 },
    taggings_with_delete_all_count: { type: "integer", default: 0 },
    taggings_with_destroy_count: { type: "integer", default: 0 },
    tags_count: { type: "integer", default: 0 },
    indestructible_tags_count: { type: "integer", default: 0 },
    tags_with_destroy_count: { type: "integer", default: 0 },
    tags_with_nullify_count: { type: "integer", default: 0 },
  },

  postesques: {
    author_name: "string",
    author_id: "string",
  },

  post_comments_counts: {
    comments_count: { type: "integer", default: 0 },
  },

  serialized_posts: {
    author_id: "integer",
    title: { type: "string", null: false },
  },

  // Rails uses custom polymorphic column names here (not the
  // `<name>_id`/`<name>_type` default) to exercise the
  // `foreign_key:`/`foreign_type:` override path on `belongs_to ...,
  // polymorphic: true`. Mirrored verbatim from schema.rb.
  images: {
    imageable_identifier: "integer",
    imageable_class: "string",
  },

  price_estimates: {
    estimate_of_type: "string",
    estimate_of_id: "integer",
    price: "integer",
    currency: "string",
  },

  products: {
    collection_id: "integer",
    type_id: "integer",
    name: "string",
    price: "decimal",
    discounted_price: "decimal",
  },

  product_types: {
    name: "string",
  },

  projects: {
    name: "string",
    type: "string",
    firm_id: "integer",
    mentor_id: "integer",
  },

  publications: {
    name: "string",
    editor_in_chief_id: "integer",
  },

  randomly_named_table1: {
    some_attribute: "string",
    another_attribute: "integer",
  },

  randomly_named_table2: {
    some_attribute: "string",
    another_attribute: "integer",
  },

  randomly_named_table3: {
    some_attribute: "string",
    another_attribute: "integer",
  },

  ratings: {
    comment_id: "integer",
    value: "integer",
  },

  readers: {
    post_id: { type: "integer", null: false },
    person_id: { type: "integer", null: false },
    skimmer: { type: "boolean", default: false },
    first_post_id: "integer",
  },

  references: {
    person_id: "integer",
    job_id: "integer",
    favorite: "boolean",
    lock_version: { type: "integer", default: 0 },
  },

  rooms: {
    user_id: "integer",
    owner_id: "integer",
    landlord_id: "integer",
    tenant_id: "integer",
  },
};
