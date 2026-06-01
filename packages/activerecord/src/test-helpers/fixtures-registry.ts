import type { Base } from "../base.js";
import { registerModel } from "../associations.js";

import * as FixtureData from "./fixtures/index.js";

type BaseClass = typeof Base;
type FixtureAttrs = Record<string, unknown>;

/**
 * A model-backed fixture-set entry. The model is resolved lazily through a dynamic
 * import so the registry can enumerate every fixture set without eagerly
 * importing every model module — several canonical models run import-time side
 * effects (`encrypts()`) that throw unless their add-on/handler is already
 * bootstrapped. Deferring the import
 * to seed time means a test only loads the models for the fixtures it requests.
 */
export interface FixtureModelEntry {
  readonly model: () => Promise<BaseClass>;
  readonly data: Record<string, FixtureAttrs>;
  /**
   * Optional add-on bootstrap awaited BEFORE the {@link FixtureModelEntry.model}
   * thunk fires. Some canonical models run import-time side effects that require
   * an opt-in add-on already loaded into the runtime — e.g. `book-encrypted.ts`
   * calls `encrypts()` in a `static {}` block, which throws unless the encryption
   * add-on (`@blazetrails/activerecord/encryption`) has registered its hooks. The
   * hook keeps the add-on opt-in: only entries that declare it pay the cost, and
   * a fixture set without one (e.g. `authors`) never loads encryption.
   */
  readonly addOn?: () => Promise<void>;
}

/**
 * Bootstraps the encryption add-on so the `EncryptedBook*` models import cleanly.
 * Importing the `../encryption.js` wiring registers `Base.encrypts`' hooks via its
 * module-load side effect — all the `static { encrypts(...) }` blocks in
 * `book-encrypted.ts` need to evaluate without throwing.
 *
 * Deliberately does NOT touch the process-global encryption config (keys):
 * that is per-suite state a fixture loader must not leak into unrelated tests.
 * The suites that load encrypted fixtures configure keys themselves with
 * snapshot/restore (mirroring how Rails' encryption test cases set up keys via
 * `ActiveRecord::EncryptionTestCase`).
 *
 * @internal
 */
const bootstrapEncryptionAddOn = (): Promise<void> => import("../encryption.js").then(() => {});

/**
 * A HABTM join-table fixture-set entry. These tables (e.g. `categories_posts`)
 * have no `ActiveRecord::Base` model in Rails — they're plain join tables of FK
 * pairs. `joinTable` is the literal DB table name; seeding goes through
 * {@link defineJoinTableFixtures} rather than {@link defineFixtures}.
 */
export interface FixtureJoinTableEntry {
  readonly joinTable: string;
  readonly data: Record<string, FixtureAttrs>;
}

export type FixtureRegistryEntry = FixtureModelEntry | FixtureJoinTableEntry;

/** @internal Narrows a registry entry to the join-table variant. */
export function isJoinTableEntry(e: FixtureRegistryEntry): e is FixtureJoinTableEntry {
  return "joinTable" in e;
}

/**
 * Maps a Rails-style fixture-set name to its canonical model class and the matching
 * `<name>FixtureData` export. Lets tests load fixtures by name —
 * `useFixtures(["authors", "posts"])` — mirroring Rails' `fixtures :authors`.
 *
 * **Key convention:** top-level fixture files use camelCase (e.g. `"authorAddresses"`
 * for `author_addresses.yml`). Subdirectory fixture files use a slash-separated path
 * whose segments are camelCased where the original YAML basename is snake_case
 * (e.g. `"admin/accounts"` for `admin/accounts.yml`,
 * `"reservedWords/distinct"` for `reserved_words/distinct.yml`).
 * Accessing a slash-keyed result requires bracket notation: `result["admin/accounts"]("david")`.
 *
 * Hand-maintained: add an entry when a fixture file gains a canonical model. The
 * underlying DB table name comes from `model.tableName`, independent of the key here.
 * The `model` thunk dynamic-imports the class so import-time side effects stay lazy.
 *
 * Unregistered fixture sets, grouped by blocker. Add an entry here when a gap closes.
 *
 * **Category A — missing canonical model (model-port work required):**
 * - `categories-ordered` — no dedicated model (alternate ordering fixture for categories)
 * - `fk-object-to-point-to`, `fk-test-has-fk`, `fk-test-has-pk` — no canonical model
 * - `mixins` — no canonical Mixin model
 * - `randomly-named-a9` — ambiguous: model uses table randomly_named_table1, not this set
 * - `virtual-columns` — no canonical VirtualColumn model
 *
 * **Category B — arunit2 alt-connection (needs alt-connection test infra):**
 * - `bad-posts`, `other-books`, `other-comments`, `other-posts`, `other-topics`
 *
 * **Category C — other blockers:**
 * - `admin/users` — `AdminUser.store("params", { coder: "YAML" })` passes a string
 *   where store() requires an object with `dump()`/`load()`; re-add once the YAML
 *   store coder is implemented.
 * - `developers` — `shared_computers` references a HABTM association name, not a column;
 *   loader can't resolve it.
 * - `developers-projects` — HABTM join table; `ref()`s `developers`, which isn't
 *   registerable yet (see `developers` above). The other three HABTM join sets
 *   (`categories-posts`, `parrots-pirates`, `peoples-treasures`) ref only loadable model
 *   sets and ARE registered.
 * - `cpk-reviews` — rows `ref("cpk_books", …)`, but `ref()` resolves to a single scalar
 *   (the CRC32 label id), not the book's generated composite `id` key component —
 *   composite-target ref resolution is a follow-up.
 * - `uuid-children`, `uuid-parents` — tables absent from the canonical SQLite TEST_SCHEMA.
 * - `naked/yml/{accounts,companies,courses,parrots,trees,…}` — model-less fixture sets
 *   (no `ActiveRecord::Base` subclass in Rails); need a model-less loader extension
 *   before they can be registered.
 *
 * Note on composite-PK seeding: `compositeIdentify` generates absent key columns, so
 * `cpk-books` seeds even when a row omits its key components. No composite-PK seeding gaps
 * remain. STI bases (`parrots`, `vegetables`) register their subclasses via `registerModel`
 * so `findStiClass` resolves each row's inheritance-column value correctly.
 */
export const fixtureRegistry = {
  "all/namespaced/accounts": {
    // Rails looks up Namespaced::Account which doesn't exist; the fixture data
    // carries only `name` — matching admin_accounts, not accounts. AdminAccount
    // is the model whose table schema fits this fixture.
    model: () => import("./models/admin/account.js").then((m) => m.AdminAccount),
    data: FixtureData.allNamespacedAccountsFixtureData,
  },
  "admin/accounts": {
    model: () => import("./models/admin/account.js").then((m) => m.AdminAccount),
    data: FixtureData.adminAccountsFixtureData,
  },
  "admin/randomlyNamedA9": {
    model: () =>
      import("./models/admin/randomly-named-c1.js").then(
        (m) => m.AdminClassNameThatDoesNotFollowCONVENTIONS1,
      ),
    data: FixtureData.adminRandomlyNamedA9FixtureData,
  },
  "admin/randomlyNamedB0": {
    model: () =>
      import("./models/admin/randomly-named-c1.js").then(
        (m) => m.AdminClassNameThatDoesNotFollowCONVENTIONS2,
      ),
    data: FixtureData.adminRandomlyNamedB0FixtureData,
  },
  accounts: {
    model: () => import("./models/account.js").then((m) => m.Account),
    data: FixtureData.accountFixtureData,
  },
  aircrafts: {
    model: () => import("./models/aircraft.js").then((m) => m.Aircraft),
    data: FixtureData.aircraftFixtureData,
  },
  authorAddresses: {
    model: () => import("./models/author.js").then((m) => m.AuthorAddress),
    data: FixtureData.authorAddressFixtureData,
  },
  authorFavorites: {
    model: () => import("./models/author.js").then((m) => m.AuthorFavorite),
    data: FixtureData.authorFavoriteFixtureData,
  },
  authors: {
    model: () => import("./models/author.js").then((m) => m.Author),
    data: FixtureData.authorFixtureData,
  },
  binaries: {
    model: () => import("./models/binary.js").then((m) => m.Binary),
    data: FixtureData.binaryFixtureData,
  },
  books: {
    model: () => import("./models/book.js").then((m) => m.Book),
    data: FixtureData.bookFixtureData,
  },
  bulbs: {
    model: () => import("./models/bulb.js").then((m) => m.Bulb),
    data: FixtureData.bulbFixtureData,
  },
  cakeDesigners: {
    model: () => import("./models/cake-designer.js").then((m) => m.CakeDesigner),
    data: FixtureData.cakeDesignerFixtureData,
  },
  cars: {
    model: () => import("./models/car.js").then((m) => m.Car),
    data: FixtureData.carFixtureData,
  },
  categories: {
    model: () => import("./models/category.js").then((m) => m.Category),
    data: FixtureData.categoryFixtureData,
  },
  "categories/specialCategories": {
    model: () => import("./models/category.js").then((m) => m.SpecialCategory),
    data: FixtureData.categoriesSpecialCategoriesFixtureData,
  },
  "categories/subsubdir/arbitraryFilename": {
    model: () => import("./models/category.js").then((m) => m.SpecialCategory),
    data: FixtureData.categoriesSubsubdirArbitraryFilenameFixtureData,
  },
  categoriesPosts: {
    joinTable: "categories_posts",
    data: FixtureData.categoriesPostsFixtureData,
  },
  categorizations: {
    model: () => import("./models/categorization.js").then((m) => m.Categorization),
    data: FixtureData.categorizationFixtureData,
  },
  chefs: {
    model: () => import("./models/chef.js").then((m) => m.Chef),
    data: FixtureData.chefFixtureData,
  },
  citations: {
    model: () => import("./models/citation.js").then((m) => m.Citation),
    data: FixtureData.citationFixtureData,
  },
  clothingItems: {
    model: () => import("./models/clothing-item.js").then((m) => m.ClothingItem),
    data: FixtureData.clothingItemFixtureData,
  },
  clubs: {
    model: () => import("./models/club.js").then((m) => m.Club),
    data: FixtureData.clubFixtureData,
  },
  collections: {
    model: () => import("./models/shop.js").then((m) => m.ShopCollection),
    data: FixtureData.collectionFixtureData,
  },
  colleges: {
    model: () => import("./models/college.js").then((m) => m.College),
    data: FixtureData.collegeFixtureData,
  },
  comments: {
    model: () => import("./models/comment.js").then((m) => m.Comment),
    data: FixtureData.commentFixtureData,
  },
  companies: {
    model: () => import("./models/company.js").then((m) => m.Company),
    data: FixtureData.companyFixtureData,
  },
  computers: {
    model: () => import("./models/computer.js").then((m) => m.Computer),
    data: FixtureData.computerFixtureData,
  },
  content: {
    model: () => import("./models/content.js").then((m) => m.Content),
    data: FixtureData.contentFixtureData,
  },
  contentPositions: {
    model: () => import("./models/content.js").then((m) => m.ContentPosition),
    data: FixtureData.contentPositionFixtureData,
  },
  courses: {
    model: () => import("./models/course.js").then((m) => m.Course),
    data: FixtureData.courseFixtureData,
  },
  cpkAuthors: {
    model: () => import("./models/cpk.js").then((m) => m.CpkAuthor),
    data: FixtureData.cpkAuthorFixtureData,
  },
  cpkBooks: {
    model: () => import("./models/cpk.js").then((m) => m.CpkBook),
    data: FixtureData.cpkBookFixtureData,
  },
  cpkOrderAgreements: {
    model: () => import("./models/cpk.js").then((m) => m.CpkOrderAgreement),
    data: FixtureData.cpkOrderAgreementFixtureData,
  },
  cpkOrders: {
    model: () => import("./models/cpk.js").then((m) => m.CpkOrder),
    data: FixtureData.cpkOrderFixtureData,
  },
  cpkOrderTags: {
    model: () => import("./models/cpk.js").then((m) => m.CpkOrderTag),
    data: FixtureData.cpkOrderTagFixtureData,
  },
  cpkTags: {
    model: () => import("./models/cpk.js").then((m) => m.CpkTag),
    data: FixtureData.cpkTagFixtureData,
  },
  customers: {
    model: () => import("./models/customer.js").then((m) => m.Customer),
    data: FixtureData.customerFixtureData,
  },
  dashboards: {
    model: () => import("./models/dashboard.js").then((m) => m.Dashboard),
    data: FixtureData.dashboardFixtureData,
  },
  deadParrots: {
    model: () => import("./models/parrot.js").then((m) => m.DeadParrot),
    data: FixtureData.deadParrotFixtureData,
  },
  dogLovers: {
    model: () => import("./models/dog-lover.js").then((m) => m.DogLover),
    data: FixtureData.dogLoverFixtureData,
  },
  dogs: {
    model: () => import("./models/dog.js").then((m) => m.Dog),
    data: FixtureData.dogFixtureData,
  },
  doubloons: {
    model: () => import("./models/doubloon.js").then((m) => m.Doubloon),
    data: FixtureData.doubloonFixtureData,
  },
  drinkDesigners: {
    model: () => import("./models/drink-designer.js").then((m) => m.DrinkDesigner),
    data: FixtureData.drinkDesignerFixtureData,
  },
  edges: {
    model: () => import("./models/edge.js").then((m) => m.Edge),
    data: FixtureData.edgeFixtureData,
  },
  encryptedBooks: {
    addOn: bootstrapEncryptionAddOn,
    model: () => import("./models/book-encrypted.js").then((m) => m.EncryptedBook),
    data: FixtureData.encryptedBookFixtureData,
  },
  encryptedBookThatIgnoresCases: {
    addOn: bootstrapEncryptionAddOn,
    model: () => import("./models/book-encrypted.js").then((m) => m.EncryptedBookThatIgnoresCase),
    data: FixtureData.encryptedBookThatIgnoresCasesFixtureData,
  },
  entrants: {
    model: () => import("./models/entrant.js").then((m) => m.Entrant),
    data: FixtureData.entrantFixtureData,
  },
  essays: {
    model: () => import("./models/essay.js").then((m) => m.Essay),
    data: FixtureData.essayFixtureData,
  },
  faces: {
    model: () => import("./models/face.js").then((m) => m.Face),
    data: FixtureData.faceFixtureData,
  },
  friendships: {
    model: () => import("./models/friendship.js").then((m) => m.Friendship),
    data: FixtureData.friendshipFixtureData,
  },
  funnyJokes: {
    model: () => import("./models/joke.js").then((m) => m.Joke),
    data: FixtureData.funnyJokeFixtureData,
  },
  humans: {
    model: () => import("./models/human.js").then((m) => m.Human),
    data: FixtureData.humanFixtureData,
  },
  interests: {
    model: () => import("./models/interest.js").then((m) => m.Interest),
    data: FixtureData.interestFixtureData,
  },
  items: {
    model: () => import("./models/item.js").then((m) => m.Item),
    data: FixtureData.itemFixtureData,
  },
  jobs: {
    model: () => import("./models/job.js").then((m) => m.Job),
    data: FixtureData.jobFixtureData,
  },
  legacyThings: {
    model: () => import("./models/legacy-thing.js").then((m) => m.LegacyThing),
    data: FixtureData.legacyThingFixtureData,
  },
  liveParrots: {
    model: () => import("./models/parrot.js").then((m) => m.LiveParrot),
    data: FixtureData.liveParrotFixtureData,
  },
  mateys: {
    model: () => import("./models/matey.js").then((m) => m.Matey),
    data: FixtureData.mateyFixtureData,
  },
  memberDetails: {
    model: () => import("./models/member-detail.js").then((m) => m.MemberDetail),
    data: FixtureData.memberDetailFixtureData,
  },
  memberTypes: {
    model: () => import("./models/member-type.js").then((m) => m.MemberType),
    data: FixtureData.memberTypeFixtureData,
  },
  members: {
    model: () => import("./models/member.js").then((m) => m.Member),
    data: FixtureData.memberFixtureData,
  },
  memberships: {
    model: () => import("./models/membership.js").then((m) => m.Membership),
    data: FixtureData.membershipFixtureData,
  },
  minimalistics: {
    model: () => import("./models/minimalistic.js").then((m) => m.Minimalistic),
    data: FixtureData.minimalisticFixtureData,
  },
  minivans: {
    model: () => import("./models/minivan.js").then((m) => m.Minivan),
    data: FixtureData.minivanFixtureData,
  },
  mixedCaseMonkeys: {
    model: () => import("./models/mixed-case-monkey.js").then((m) => m.MixedCaseMonkey),
    data: FixtureData.mixedCaseMonkeyFixtureData,
  },
  movies: {
    model: () => import("./models/movie.js").then((m) => m.Movie),
    data: FixtureData.movieFixtureData,
  },
  nodes: {
    model: () => import("./models/node.js").then((m) => m.Node),
    data: FixtureData.nodeFixtureData,
  },
  oneNeedQuoting: {
    model: () => import("./models/need-quoting.js").then((m) => m.NeedQuoting),
    data: FixtureData.oneNeedQuotingFixtureData,
  },
  organizations: {
    model: () => import("./models/organization.js").then((m) => m.Organization),
    data: FixtureData.organizationFixtureData,
  },
  otherDogs: {
    model: () => import("./models/other-dog.js").then((m) => m.OtherDog),
    data: FixtureData.otherDogFixtureData,
  },
  owners: {
    model: () => import("./models/owner.js").then((m) => m.Owner),
    data: FixtureData.ownerFixtureData,
  },
  paragraphs: {
    model: () => import("./models/paragraph.js").then((m) => m.Paragraph),
    data: FixtureData.paragraphFixtureData,
  },
  parrots: {
    // STI base. LiveParrot/DeadParrot live in the same module; registering them
    // in `modelRegistry` (Rails' autoloader analog — `findStiClass` resolves the
    // inheritance-column value through it) lets the base reload hydrate each row
    // as its declared `parrot_sti_class` subclass.
    model: () =>
      import("./models/parrot.js").then((m) => {
        registerModel(m.LiveParrot);
        registerModel(m.DeadParrot);
        return m.Parrot;
      }),
    data: FixtureData.parrotFixtureData,
  },
  parrotsPirates: {
    joinTable: "parrots_pirates",
    data: FixtureData.parrotsPiratesFixtureData,
  },
  people: {
    model: () => import("./models/person.js").then((m) => m.Person),
    data: FixtureData.personFixtureData,
  },
  peoplesTreasures: {
    joinTable: "peoples_treasures",
    data: FixtureData.peoplesTreasuresFixtureData,
  },
  pets: {
    model: () => import("./models/pet.js").then((m) => m.Pet),
    data: FixtureData.petFixtureData,
  },
  pirates: {
    model: () => import("./models/pirate.js").then((m) => m.Pirate),
    data: FixtureData.pirateFixtureData,
  },
  posts: {
    model: () => import("./models/post.js").then((m) => m.Post),
    data: FixtureData.postFixtureData,
  },
  priceEstimates: {
    model: () => import("./models/price-estimate.js").then((m) => m.PriceEstimate),
    data: FixtureData.priceEstimateFixtureData,
  },
  products: {
    model: () => import("./models/shop.js").then((m) => m.ShopProduct),
    data: FixtureData.productFixtureData,
  },
  projects: {
    model: () => import("./models/project.js").then((m) => m.Project),
    data: FixtureData.projectFixtureData,
  },
  ratings: {
    model: () => import("./models/rating.js").then((m) => m.Rating),
    data: FixtureData.ratingFixtureData,
  },
  readers: {
    model: () => import("./models/reader.js").then((m) => m.Reader),
    data: FixtureData.readerFixtureData,
  },
  references: {
    model: () => import("./models/reference.js").then((m) => m.Reference),
    data: FixtureData.referenceFixtureData,
  },
  shardedBlogPosts: {
    model: () => import("./models/sharded.js").then((m) => m.ShardedBlogPost),
    data: FixtureData.shardedBlogPostFixtureData,
  },
  shardedBlogPostsTags: {
    model: () => import("./models/sharded.js").then((m) => m.ShardedBlogPostTag),
    data: FixtureData.shardedBlogPostTagFixtureData,
  },
  shardedBlogs: {
    model: () => import("./models/sharded.js").then((m) => m.ShardedBlog),
    data: FixtureData.shardedBlogFixtureData,
  },
  shardedComments: {
    model: () => import("./models/sharded.js").then((m) => m.ShardedComment),
    data: FixtureData.shardedCommentFixtureData,
  },
  shardedTags: {
    model: () => import("./models/sharded.js").then((m) => m.ShardedTag),
    data: FixtureData.shardedTagFixtureData,
  },
  ships: {
    model: () => import("./models/ship.js").then((m) => m.Ship),
    data: FixtureData.shipFixtureData,
  },
  speedometers: {
    model: () => import("./models/speedometer.js").then((m) => m.Speedometer),
    data: FixtureData.speedometerFixtureData,
  },
  sponsors: {
    model: () => import("./models/sponsor.js").then((m) => m.Sponsor),
    data: FixtureData.sponsorFixtureData,
  },
  strictZines: {
    model: () => import("./models/strict-zine.js").then((m) => m.StrictZine),
    data: FixtureData.strictZineFixtureData,
  },
  stringKeyObjects: {
    model: () => import("./models/string-key-object.js").then((m) => m.StringKeyObject),
    data: FixtureData.stringKeyObjectFixtureData,
  },
  subscribers: {
    model: () => import("./models/subscriber.js").then((m) => m.Subscriber),
    data: FixtureData.subscriberFixtureData,
  },
  subscriptions: {
    model: () => import("./models/subscription.js").then((m) => m.Subscription),
    data: FixtureData.subscriptionFixtureData,
  },
  taggings: {
    model: () => import("./models/tagging.js").then((m) => m.Tagging),
    data: FixtureData.taggingFixtureData,
  },
  tags: {
    model: () => import("./models/tag.js").then((m) => m.Tag),
    data: FixtureData.tagFixtureData,
  },
  tasks: {
    model: () => import("./models/task.js").then((m) => m.Task),
    data: FixtureData.taskFixtureData,
  },
  topics: {
    model: () => import("./models/topic.js").then((m) => m.Topic),
    data: FixtureData.topicFixtureData,
  },
  toys: {
    model: () => import("./models/toy.js").then((m) => m.Toy),
    data: FixtureData.toyFixtureData,
  },
  trafficLights: {
    model: () => import("./models/traffic-light.js").then((m) => m.TrafficLight),
    data: FixtureData.trafficLightFixtureData,
  },
  treasures: {
    model: () => import("./models/treasure.js").then((m) => m.Treasure),
    data: FixtureData.treasureFixtureData,
  },
  trees: {
    model: () => import("./models/tree.js").then((m) => m.Tree),
    data: FixtureData.treeFixtureData,
  },
  variants: {
    model: () => import("./models/shop.js").then((m) => m.ShopVariant),
    data: FixtureData.variantFixtureData,
  },
  vertices: {
    model: () => import("./models/vertex.js").then((m) => m.Vertex),
    data: FixtureData.vertexFixtureData,
  },
  vegetables: {
    // STI base with custom inheritance column `custom_type`. Register the
    // subclasses the fixture rows reference so the base reload resolves each
    // `custom_type` value to its concrete class.
    model: () =>
      import("./models/vegetables.js").then((m) => {
        registerModel(m.Cucumber);
        registerModel(m.Cabbage);
        registerModel(m.RedCabbage);
        return m.Vegetable;
      }),
    data: FixtureData.vegetableFixtureData,
  },
  warehouseThings: {
    model: () => import("./models/warehouse-thing.js").then((m) => m.WarehouseThing),
    data: FixtureData.warehouseThingFixtureData,
  },
  zines: {
    model: () => import("./models/zine.js").then((m) => m.Zine),
    data: FixtureData.zineFixtureData,
  },
} as const;

// Conformance check without `satisfies` on the literal: a contextual
// `satisfies Record<string, FixtureRegistryEntry>` would widen each `model`
// thunk's return into a `typeof Base | <Model>` union (the declared BaseClass
// unified with the concrete class), collapsing `RegistryModel<N>` to that union.
// This standalone assertion validates the shape while preserving the narrow
// per-entry types from `as const`.
type _AssertRegistryShape =
  typeof fixtureRegistry extends Record<string, FixtureRegistryEntry> ? true : never;
const _registryConforms: _AssertRegistryShape = true;
void _registryConforms;

/** Union of all registered fixture-set names. */
export type FixtureName = keyof typeof fixtureRegistry;

/** The canonical model class registered for fixture-set `N` (never for join-table sets). */
export type RegistryModel<N extends FixtureName> = (typeof fixtureRegistry)[N] extends {
  model: () => Promise<infer M extends BaseClass>;
}
  ? M
  : never;

/** True for join-table fixture-set names (no model class). */
export type IsJoinTableName<N extends FixtureName> = (typeof fixtureRegistry)[N] extends {
  joinTable: string;
}
  ? true
  : false;

/** The fixture-data object registered for fixture-set `N`. */
export type RegistryData<N extends FixtureName> = (typeof fixtureRegistry)[N]["data"];
