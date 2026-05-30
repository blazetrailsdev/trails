import type { Base } from "../base.js";
import { registerModel } from "../associations.js";

import * as FixtureData from "./fixtures/index.js";

type BaseClass = typeof Base;
type FixtureAttrs = Record<string, unknown>;

/**
 * A model-backed fixture-set entry. The model is resolved lazily through a dynamic
 * import so the registry can enumerate every fixture set without eagerly
 * importing every model module — several canonical models run import-time side
 * effects (`encrypts()`, `acceptsNestedAttributesFor` on polymorphic refs) that
 * throw unless their add-on/handler is already bootstrapped. Deferring the import
 * to seed time means a test only loads the models for the fixtures it requests.
 */
export interface FixtureModelEntry {
  readonly model: () => Promise<BaseClass>;
  readonly data: Record<string, FixtureAttrs>;
}

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
 * Maps a Rails-style fixture-set name (camelCased file basename) to its canonical
 * model class and the matching `<name>FixtureData` export. Lets tests load fixtures
 * by name — `useFixtures(["authors", "posts"])` — mirroring Rails' `fixtures :authors`.
 *
 * Hand-maintained: add an entry when a fixture file gains a canonical model. Keys are
 * camelCase (no snake_case) so they are valid accessor identifiers; the underlying DB
 * table name comes from `model.tableName`, independent of the key here. The `model`
 * thunk dynamic-imports the class so import-time side effects stay lazy.
 *
 * Known gaps — fixture data WITHOUT a registered model (intentionally omitted):
 * - `bad-posts` — no canonical model (arunit2 alt-connection fixture)
 * - `categories-ordered` — no dedicated model (alternate ordering fixture for categories)
 * - `chefs` — `chef.ts` throws at import: trails' `acceptsNestedAttributesFor`
 *   eagerly rejects the polymorphic `employable` belongs_to, whereas Rails
 *   (chef.rb: `accepts_nested_attributes_for :employable`) defers that check to
 *   build time. Pre-existing model-port divergence; re-add once chef.ts imports cleanly.
 * - `encrypted-book-that-ignores-cases` — same encryption add-on requirement
 * - `encrypted-books` — model requires the `@blazetrails/activerecord/encryption` add-on loaded at import time
 * - `fk-object-to-point-to` — no canonical model
 * - `fk-test-has-fk` — no canonical model
 * - `fk-test-has-pk` — no canonical model
 * - `mixins` — no canonical Mixin model
 * - `other-books` — no canonical model (arunit2 alt-connection fixture)
 * - `other-comments` — no canonical model (arunit2 alt-connection fixture)
 * - `other-posts` — no canonical model (arunit2 alt-connection fixture)
 * - `other-topics` — no canonical model (arunit2 alt-connection fixture)
 * - `randomly-named-a9` — ambiguous — model uses table randomly_named_table1, not this set
 * - `virtual-columns` — no canonical VirtualColumn model
 *
 * Additional gaps — model imports, but the fixture set does NOT seed against the
 * canonical `TEST_SCHEMA` today (verified by the seed-conformance test). Grouped by
 * the underlying loader gap; each is re-addable once that gap closes:
 * (no composite-PK seeding gaps remain — `compositeIdentify` generates absent key
 * columns, so `cpk-books` seeds even when a row omits its key components.)
 * (STI bases with a `type`/custom-inheritance row — `parrots`, `vegetables` — now
 * register their subclasses: the subclasses live in the same model module as the
 * base, and the base's `model` thunk `registerModel`s them so `findStiClass`
 * resolves each row's inheritance-column value and the reload returns the correct
 * subclass instance.)
 * - fixture references a non-column (HABTM assoc name): `developers` (`shared_computers`)
 * - table absent from the canonical SQLite `TEST_SCHEMA`: `uuid-children`, `uuid-parents`
 * - seeds on SQLite (dynamic typing) but NOT on the strict PG/MariaDB CI engines —
 *   real cross-engine data/cast bugs that would fail `useFixtures([set])` for those users:
 *   - `books` — `boolean_status` is boolean in PG; fixture row supplies an integer
 *   - `citations` — `book2_id` ref() value overflows the column's integer range
 *   - `memberships` — STI `type` string ("CurrentMembership") written to an integer `type` column
 *   - `tasks` — tz-offset datetime literal rejected by MariaDB's `datetime` column
 *
 * Additional gaps — the model seeds, but the fixture data `ref()`s a table that is
 * itself NOT loadable by name (it's gap-listed above). `ref()` falls back to the
 * CRC32 of the target label, which diverges from the target's declared Rails id, so
 * `useFixtures([set])` would seed foreign keys pointing at rows that can't be loaded
 * by name. Re-addable once the ref'd set becomes registerable (verified by the
 * "refs only loadable tables" conformance test):
 * - `subscriptions` → `books` (books declare ids 1-4; `book_id` would be CRC32)
 * - `cpk-reviews` → `cpk-books`: its rows `ref("cpk_books", …)`, but `ref()`
 *   resolves to a single scalar (the CRC32 label id), not the book's generated
 *   composite `id` key component — composite-target ref resolution is a separate
 *   follow-up.
 * - `developers-projects` — HABTM join table (`developers_projects`); seeds fine via the
 *   join-table loader, but `ref()`s `developers`, which isn't registerable yet (the
 *   `developers` set has a `shared_computers` non-column gap, listed above). Re-add once
 *   `developers` is registerable. The other three HABTM join sets (`categories-posts`,
 *   `parrots-pirates`, `peoples-treasures`) ref only loadable model sets and ARE registered.
 */
export const fixtureRegistry = {
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
  categoriesPosts: {
    joinTable: "categories_posts",
    data: FixtureData.categoriesPostsFixtureData,
  },
  categorizations: {
    model: () => import("./models/categorization.js").then((m) => m.Categorization),
    data: FixtureData.categorizationFixtureData,
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
  taggings: {
    model: () => import("./models/tagging.js").then((m) => m.Tagging),
    data: FixtureData.taggingFixtureData,
  },
  tags: {
    model: () => import("./models/tag.js").then((m) => m.Tag),
    data: FixtureData.tagFixtureData,
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
