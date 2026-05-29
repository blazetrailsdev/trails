import type { Base } from "../base.js";

import * as FixtureData from "./fixtures/index.js";

type BaseClass = typeof Base;
type FixtureAttrs = Record<string, unknown>;

/**
 * A single fixture-set entry. The model is resolved lazily through a dynamic
 * import so the registry can enumerate every fixture set without eagerly
 * importing every model module — several canonical models run import-time side
 * effects (`encrypts()`, `acceptsNestedAttributesFor` on polymorphic refs) that
 * throw unless their add-on/handler is already bootstrapped. Deferring the import
 * to seed time means a test only loads the models for the fixtures it requests.
 */
export interface FixtureRegistryEntry {
  readonly model: () => Promise<BaseClass>;
  readonly data: Record<string, FixtureAttrs>;
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
 * - `categories-posts` — HABTM join table, no model class
 * - `chefs` — `chef.ts` throws at import: trails' `acceptsNestedAttributesFor`
 *   eagerly rejects the polymorphic `employable` belongs_to, whereas Rails
 *   (chef.rb: `accepts_nested_attributes_for :employable`) defers that check to
 *   build time. Pre-existing model-port divergence; re-add once chef.ts imports cleanly.
 * - `cpk-orders` — `CpkOrder` has a composite primary key (`["shop_id", "id"]`);
 *   `defineFixtures` throws on composite PKs, so the entry would always fail at
 *   seed time. Re-add once composite-PK fixture seeding is supported.
 * - `developers-projects` — HABTM join table, no model class
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
 * - `parrots-pirates` — HABTM join table, no model class
 * - `peoples-treasures` — HABTM join table, no model class
 * - `randomly-named-a9` — ambiguous — model uses table randomly_named_table1, not this set
 * - `virtual-columns` — no canonical VirtualColumn model
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
  categorizations: {
    model: () => import("./models/categorization.js").then((m) => m.Categorization),
    data: FixtureData.categorizationFixtureData,
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
  cpkOrderTags: {
    model: () => import("./models/cpk.js").then((m) => m.CpkOrderTag),
    data: FixtureData.cpkOrderTagFixtureData,
  },
  cpkReviews: {
    model: () => import("./models/cpk.js").then((m) => m.CpkReview),
    data: FixtureData.cpkReviewFixtureData,
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
  developers: {
    model: () => import("./models/developer.js").then((m) => m.Developer),
    data: FixtureData.developerFixtureData,
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
    model: () => import("./models/parrot.js").then((m) => m.Parrot),
    data: FixtureData.parrotFixtureData,
  },
  people: {
    model: () => import("./models/person.js").then((m) => m.Person),
    data: FixtureData.personFixtureData,
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
  uuidChildren: {
    model: () => import("./models/uuid-child.js").then((m) => m.UuidChild),
    data: FixtureData.uuidChildFixtureData,
  },
  uuidParents: {
    model: () => import("./models/uuid-parent.js").then((m) => m.UuidParent),
    data: FixtureData.uuidParentFixtureData,
  },
  variants: {
    model: () => import("./models/shop.js").then((m) => m.ShopVariant),
    data: FixtureData.variantFixtureData,
  },
  vegetables: {
    model: () => import("./models/vegetables.js").then((m) => m.Vegetable),
    data: FixtureData.vegetableFixtureData,
  },
  vertices: {
    model: () => import("./models/vertex.js").then((m) => m.Vertex),
    data: FixtureData.vertexFixtureData,
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

/** The canonical model class registered for fixture-set `N`. */
export type RegistryModel<N extends FixtureName> = Awaited<
  ReturnType<(typeof fixtureRegistry)[N]["model"]>
>;

/** The fixture-data object registered for fixture-set `N`. */
export type RegistryData<N extends FixtureName> = (typeof fixtureRegistry)[N]["data"];
