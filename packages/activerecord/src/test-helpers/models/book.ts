import type { AssociationProxy } from "../../associations/collection-proxy.js";
import type { Relation } from "../../relation.js";
import type { Author } from "./author.js";
import type { Citation } from "./citation.js";
import type { Essay } from "./essay.js";
import type { Reference } from "./reference.js";
import type { Subscriber } from "./subscriber.js";
import type { Subscription } from "./subscription.js";
// vendor/rails/activerecord/test/models/book.rb
import { Base } from "../../base.js";

export class Book extends Base {
  declare author: Author | null;
  declare formatRecord: Base | null;
  declare citations: AssociationProxy<Citation>;
  declare references: AssociationProxy<Reference>;
  declare subscriptions: AssociationProxy<Subscription>;
  declare subscribers: AssociationProxy<Subscriber>;
  declare essay: Essay | null;
  declare isProposed: () => boolean;
  declare proposedBang: () => Promise<true>;
  declare static proposed: () => Relation<Book>;
  declare static notProposed: () => Relation<Book>;
  declare isWritten: () => boolean;
  declare writtenBang: () => Promise<true>;
  declare static written: () => Relation<Book>;
  declare static notWritten: () => Relation<Book>;
  declare isPublished: () => boolean;
  declare publishedBang: () => Promise<true>;
  declare static published: () => Relation<Book>;
  declare static notPublished: () => Relation<Book>;
  declare isUnread: () => boolean;
  declare unreadBang: () => Promise<true>;
  declare static unread: () => Relation<Book>;
  declare static notUnread: () => Relation<Book>;
  declare isReading: () => boolean;
  declare readingBang: () => Promise<true>;
  declare static reading: () => Relation<Book>;
  declare static notReading: () => Relation<Book>;
  declare isRead: () => boolean;
  declare readBang: () => Promise<true>;
  declare static read: () => Relation<Book>;
  declare static notRead: () => Relation<Book>;
  declare isSingle: () => boolean;
  declare singleBang: () => Promise<true>;
  declare static single: () => Relation<Book>;
  declare static notSingle: () => Relation<Book>;
  declare isMarried: () => boolean;
  declare marriedBang: () => Promise<true>;
  declare static married: () => Relation<Book>;
  declare static notMarried: () => Relation<Book>;
  declare isInEnglish: () => boolean;
  declare inEnglishBang: () => Promise<true>;
  declare static inEnglish: () => Relation<Book>;
  declare static notInEnglish: () => Relation<Book>;
  declare isInSpanish: () => boolean;
  declare inSpanishBang: () => Promise<true>;
  declare static inSpanish: () => Relation<Book>;
  declare static notInSpanish: () => Relation<Book>;
  declare isInFrench: () => boolean;
  declare inFrenchBang: () => Promise<true>;
  declare static inFrench: () => Relation<Book>;
  declare static notInFrench: () => Relation<Book>;
  declare isAuthorVisibilityVisible: () => boolean;
  declare authorVisibilityVisibleBang: () => Promise<true>;
  declare static authorVisibilityVisible: () => Relation<Book>;
  declare static notAuthorVisibilityVisible: () => Relation<Book>;
  declare isAuthorVisibilityInvisible: () => boolean;
  declare authorVisibilityInvisibleBang: () => Promise<true>;
  declare static authorVisibilityInvisible: () => Relation<Book>;
  declare static notAuthorVisibilityInvisible: () => Relation<Book>;
  declare isIllustratorVisibilityVisible: () => boolean;
  declare illustratorVisibilityVisibleBang: () => Promise<true>;
  declare static illustratorVisibilityVisible: () => Relation<Book>;
  declare static notIllustratorVisibilityVisible: () => Relation<Book>;
  declare isIllustratorVisibilityInvisible: () => boolean;
  declare illustratorVisibilityInvisibleBang: () => Promise<true>;
  declare static illustratorVisibilityInvisible: () => Relation<Book>;
  declare static notIllustratorVisibilityInvisible: () => Relation<Book>;
  declare isWithSmallFontSize: () => boolean;
  declare withSmallFontSizeBang: () => Promise<true>;
  declare static withSmallFontSize: () => Relation<Book>;
  declare static notWithSmallFontSize: () => Relation<Book>;
  declare isWithMediumFontSize: () => boolean;
  declare withMediumFontSizeBang: () => Promise<true>;
  declare static withMediumFontSize: () => Relation<Book>;
  declare static notWithMediumFontSize: () => Relation<Book>;
  declare isWithLargeFontSize: () => boolean;
  declare withLargeFontSizeBang: () => Promise<true>;
  declare static withLargeFontSize: () => Relation<Book>;
  declare static notWithLargeFontSize: () => Relation<Book>;
  declare isEasyToRead: () => boolean;
  declare easyToReadBang: () => Promise<true>;
  declare static easyToRead: () => Relation<Book>;
  declare static notEasyToRead: () => Relation<Book>;
  declare isMediumToRead: () => boolean;
  declare mediumToReadBang: () => Promise<true>;
  declare static mediumToRead: () => Relation<Book>;
  declare static notMediumToRead: () => Relation<Book>;
  declare isHardToRead: () => boolean;
  declare hardToReadBang: () => Promise<true>;
  declare static hardToRead: () => Relation<Book>;
  declare static notHardToRead: () => Relation<Book>;
  declare loadBelongsTo: ((name: "author") => Promise<Author | null>) &
    ((name: "formatRecord") => Promise<Base | null>);
  declare loadHasOne: (name: "essay") => Promise<Essay | null>;
  declare columns: unknown | null;
  declare indexes: unknown | null;

  static {
    this.belongsTo("author");
    this.belongsTo("formatRecord", { polymorphic: true });
    this.hasMany("citations", { inverseOf: "book" });
    this.hasMany("references", { through: "citations", source: "referenceOf" });
    this.hasMany("subscriptions");
    this.hasMany("subscribers", { through: "subscriptions" });
    this.hasOne("essay");
    this.aliasAttribute("title", "name");
    this.enum("status", { proposed: 0, written: 1, published: 2 });
    // Rails: { unread: 0, reading: 2, read: 3, forgotten: nil } — null value unsupported by enum()
    this.enum("last_read", { unread: 0, reading: 2, read: 3 });
    this.enum("nullable_status", { single: 0, married: 1 });
    this.enum("language", { english: 0, spanish: 1, french: 2 }, { prefix: "in" });
    this.enum("author_visibility", { visible: 0, invisible: 1 }, { prefix: true });
    this.enum("illustrator_visibility", { visible: 0, invisible: 1 }, { prefix: true });
    this.enum("font_size", { small: 0, medium: 1, large: 2 }, { prefix: "with", suffix: true });
    this.enum("difficulty", { easy: 0, medium: 1, hard: 2 }, { suffix: "toRead" });
    // Rails: cover { hard: "hard", soft: "soft" } and boolean_status { enabled: true, disabled: false }
    // omitted — non-integer enum values not yet supported by enum()
  }
}

export class PublishedBook extends Base {
  static _tableName = "books";

  static {
    // Rails: cover { hard: "0", soft: "1" } — string values unsupported by enum(); omitted
    this.validates("isbn", { uniqueness: true });
  }
}
