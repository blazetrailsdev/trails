import type { Base } from "../base.js";

import * as FixtureData from "./fixtures/index.js";

type BaseClass = typeof Base;
type FixtureAttrs = Record<string, unknown>;

export interface FixtureModelEntry {
  readonly model: () => Promise<BaseClass | readonly BaseClass[]>;
  readonly data: Record<string, FixtureAttrs>;
  readonly addOn?: () => Promise<void>;
}

/** @internal */
const bootstrapEncryptionAddOn = (): Promise<void> => import("../encryption.js").then(() => {});

export interface FixtureJoinTableEntry {
  readonly joinTable: string;
  readonly data: Record<string, FixtureAttrs>;
}

export type FixtureRegistryEntry = FixtureModelEntry | FixtureJoinTableEntry;

/** @internal */
export function isJoinTableEntry(e: FixtureRegistryEntry): e is FixtureJoinTableEntry {
  return "joinTable" in e;
}

export const fixtureRegistry = {
  "all/namespaced/accounts": {
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
  "admin/users": {
    model: () => import("./models/admin/user.js").then((m) => m.AdminUser),
    data: FixtureData.adminUsersFixtureData,
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
  developers: {
    model: (): Promise<
      [
        typeof import("./models/developer.js").Developer,
        typeof import("./models/computer.js").Computer,
      ]
    > =>
      import("./models/developer.js").then(async (m) => {
        const { Computer } = await import("./models/computer.js");
        return [m.Developer, Computer];
      }),
    data: FixtureData.developerFixtureData,
  },
  developersProjects: {
    joinTable: "developers_projects",
    data: FixtureData.developersProjectsFixtureData,
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
  lions: {
    model: () => import("./models/cat.js").then((m) => m.Lion),
    data: FixtureData.lionFixtureData,
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
    model: (): Promise<
      [
        typeof import("./models/parrot.js").Parrot,
        typeof import("./models/parrot.js").LiveParrot,
        typeof import("./models/parrot.js").DeadParrot,
      ]
    > => import("./models/parrot.js").then((m) => [m.Parrot, m.LiveParrot, m.DeadParrot]),
    data: FixtureData.parrotFixtureData,
  },
  parrotsPirates: {
    joinTable: "parrots_pirates",
    data: FixtureData.parrotsPiratesFixtureData,
  },
  parrotsTreasures: {
    joinTable: "parrots_treasures",
    data: FixtureData.parrotsTreasuresFixtureData,
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
    model: () =>
      Promise.all([import("./models/topic.js"), import("./models/reply.js")]).then(
        ([m]) => m.Topic,
      ),
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
    model: (): Promise<
      [
        typeof import("./models/vegetables.js").Vegetable,
        typeof import("./models/vegetables.js").Cucumber,
        typeof import("./models/vegetables.js").Cabbage,
        typeof import("./models/vegetables.js").RedCabbage,
      ]
    > =>
      import("./models/vegetables.js").then((m) => [
        m.Vegetable,
        m.Cucumber,
        m.Cabbage,
        m.RedCabbage,
      ]),
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

type _AssertRegistryShape =
  typeof fixtureRegistry extends Record<string, FixtureRegistryEntry> ? true : never;
const _registryConforms: _AssertRegistryShape = true;
void _registryConforms;

export type FixtureName = keyof typeof fixtureRegistry;

export type RegistryModel<N extends FixtureName> = (typeof fixtureRegistry)[N] extends {
  model: () => Promise<infer R>;
}
  ? R extends readonly [infer First, ...unknown[]]
    ? First extends BaseClass
      ? First
      : never
    : R extends BaseClass
      ? R
      : never
  : never;

export type IsJoinTableName<N extends FixtureName> = (typeof fixtureRegistry)[N] extends {
  joinTable: string;
}
  ? true
  : false;

export type RegistryData<N extends FixtureName> = (typeof fixtureRegistry)[N]["data"];
