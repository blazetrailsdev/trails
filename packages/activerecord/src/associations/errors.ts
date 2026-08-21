/**
 * Association-specific error classes.
 *
 * Mirrors: ActiveRecord::Associations error classes defined in
 * activerecord/lib/active_record/associations/errors.rb
 */
import { singularize } from "@blazetrails/activesupport";
import { SpellChecker } from "@blazetrails/did-you-mean";
import { ActiveRecordError, ConfigurationError } from "../errors.js";

/**
 * Mirrors Rails' `DidYouMean::Correctable#detailed_message`: the base message
 * plus a "Did you mean?" suggestion line built from the closest names, each on
 * its own line indented to align under the first correction. Shared by every
 * association error that mixes in `DidYouMean::Correctable` so they all format
 * suggestions identically.
 *
 * @internal
 */
function withCorrections(message: string, corrections: string[]): string {
  if (corrections.length === 0) return message;
  return `${message}\nDid you mean?  ${corrections.join("\n               ")}`;
}

export class AssociationNotFoundError extends ConfigurationError {
  readonly record: any;
  readonly associationName: string;
  readonly corrections: string[];

  constructor(record: any, associationName: string, corrections: string[] = []) {
    super(
      `Association named '${associationName}' was not found on ${record?.constructor?.name ?? record}; perhaps you misspelled it?`,
    );
    this.name = "AssociationNotFoundError";
    this.record = record;
    this.associationName = associationName;
    this.corrections = corrections;
  }

  /**
   * Mirrors Rails' `DidYouMean::Correctable#detailed_message`: the base
   * message plus a "Did you mean?" suggestion line built from the closest
   * declared association names. The suggestion lives here (not in `message`)
   * to match Rails, where corrections surface only via `detailed_message`.
   */
  detailedMessage(): string {
    return withCorrections(this.message, this.corrections);
  }
}

/**
 * The reflection surface `InverseOfAssociationNotFoundError` reads. Structural
 * so `associations/errors.ts` takes no import on `reflection.ts`, which imports
 * this file.
 *
 * @internal
 */
interface InverseOfReflection {
  readonly name: string;
  readonly options: Record<string, unknown>;
  readonly className: string;
  readonly klass: InverseOfAssociatedClass;
}

/**
 * The `associated_class` surface the error reads: its name, and its declared
 * association names for the `Did you mean?` dictionary.
 *
 * @internal
 */
interface InverseOfAssociatedClass {
  readonly name: string;
  reflections(): Readonly<Record<string, unknown>>;
}

/**
 * `reflection.options[:inverse_of].inspect` — a Ruby Symbol inspects with its
 * leading colon, `nil` as "nil". Shared by the two inverse-of errors, whose
 * Rails messages both interpolate it (associations/errors.rb:39, :66).
 *
 * @internal
 */
function inspectInverseOf(reflection: InverseOfReflection): string {
  const inverseOf = reflection.options["inverseOf"];
  return inverseOf == null ? "nil" : `:${String(inverseOf)}`;
}

export class InverseOfAssociationNotFoundError extends ActiveRecordError {
  readonly reflection: InverseOfReflection | null;
  readonly associatedClass: InverseOfAssociatedClass | null;
  private _corrections?: string[];

  constructor(
    reflection: InverseOfReflection | null = null,
    associatedClass: InverseOfAssociatedClass | null = null,
  ) {
    super(
      reflection
        ? `Could not find the inverse association for ${reflection.name} (${inspectInverseOf(
            reflection,
          )} in ${associatedClass == null ? reflection.className : associatedClass.name})`
        : "Could not find the inverse association.",
    );
    this.name = "InverseOfAssociationNotFoundError";
    this.reflection = reflection;
    // `associated_class.nil? ? reflection.klass : associated_class`
    // (associations/errors.rb:38). `klass` is not always resolvable here, where
    // Ruby would raise NameError: the resolution failure is swallowed to `null`
    // so the inverse-of error this is already constructing is what surfaces.
    if (reflection == null) {
      this.associatedClass = null;
    } else if (associatedClass != null) {
      this.associatedClass = associatedClass;
    } else {
      let klass: InverseOfAssociatedClass | null = null;
      try {
        klass = reflection.klass;
      } catch {
        klass = null;
      }
      this.associatedClass = klass;
    }
  }

  get corrections(): string[] {
    if (this.reflection && this.associatedClass) {
      if (!this._corrections) {
        const maybeThese = Object.keys(this.associatedClass.reflections());
        this._corrections = new SpellChecker({ dictionary: maybeThese }).correct(
          String(this.reflection.options["inverseOf"] ?? ""),
        );
      }
      return this._corrections;
    }
    return [];
  }

  detailedMessage(): string {
    return withCorrections(this.message, this.corrections);
  }
}

export class InverseOfAssociationRecursiveError extends ActiveRecordError {
  readonly reflection: InverseOfReflection | null;

  constructor(reflection: InverseOfReflection | null = null) {
    super(
      reflection
        ? `Inverse association ${reflection.name} (${inspectInverseOf(reflection)} in ${
            reflection.className
          }) is recursive.`
        : "Inverse association is recursive.",
    );
    this.name = "InverseOfAssociationRecursiveError";
    this.reflection = reflection;
  }
}

export class HasManyThroughAssociationNotFoundError extends ActiveRecordError {
  readonly ownerClass: string;
  readonly reflection: string;
  readonly corrections: string[];

  constructor(
    owner: string,
    through: string,
    reflection: string = through,
    corrections: string[] = [],
  ) {
    super(`Could not find the association :${through} in model ${owner}`);
    this.name = "HasManyThroughAssociationNotFoundError";
    this.ownerClass = owner;
    this.reflection = reflection;
    this.corrections = corrections;
  }

  detailedMessage(): string {
    return withCorrections(this.message, this.corrections);
  }
}

export class HasManyThroughAssociationPolymorphicSourceError extends ActiveRecordError {
  constructor(owner: string, association: string, source: string) {
    super(
      `Cannot have a has_many :through association '${association}' on ${owner} which goes through the polymorphic association '${source}'.`,
    );
    this.name = "HasManyThroughAssociationPolymorphicSourceError";
  }
}

export class HasManyThroughAssociationPolymorphicThroughError extends ActiveRecordError {
  constructor(owner: string, association: string) {
    super(
      `Cannot have a has_many :through association '${association}' on ${owner} that has a polymorphic :through association.`,
    );
    this.name = "HasManyThroughAssociationPolymorphicThroughError";
  }
}

export class HasManyThroughAssociationPointlessSourceTypeError extends ActiveRecordError {
  constructor(owner: string, association: string, source: string) {
    super(
      `Cannot have a has_many :through association '${association}' on ${owner} with a :source_type but the :source '${source}' is not polymorphic.`,
    );
    this.name = "HasManyThroughAssociationPointlessSourceTypeError";
  }
}

export class HasOneThroughCantAssociateThroughCollection extends ActiveRecordError {
  constructor(owner: string, association: string, through: string) {
    super(
      `Cannot have a has_one :through association '${association}' on ${owner} going through '${through}' which is a collection. Specify a has_one or belongs_to association instead.`,
    );
    this.name = "HasOneThroughCantAssociateThroughCollection";
  }
}

export class HasOneAssociationPolymorphicThroughError extends ActiveRecordError {
  constructor(owner: string, association: string) {
    super(
      `Cannot have a has_one :through association '${association}' on ${owner} that has a polymorphic :through association.`,
    );
    this.name = "HasOneAssociationPolymorphicThroughError";
  }
}

export class HasManyThroughSourceAssociationNotFoundError extends ActiveRecordError {
  constructor(owner: string, through: string, source: string, association: string) {
    super(
      `Could not find the source association(s) :${source} on ${owner} through '${through}'. Try 'hasMany ${association}, { through: "${through}", source: "<source_name>" }' with a valid source association defined on ${through}.`,
    );
    this.name = "HasManyThroughSourceAssociationNotFoundError";
  }
}

export class HasManyThroughOrderError extends ActiveRecordError {
  constructor(owner: string, association: string, through: string) {
    super(
      `Cannot have a has_many :through association '${association}' on ${owner} which goes through '${through}' before the through association is defined.`,
    );
    this.name = "HasManyThroughOrderError";
  }
}

export class ThroughCantAssociateThroughHasOneOrManyReflection extends ActiveRecordError {
  constructor(owner: string, association: string) {
    super(
      `Cannot modify association '${association}' on ${owner} because the source reflection is through a has_one or has_many reflection.`,
    );
    this.name = "ThroughCantAssociateThroughHasOneOrManyReflection";
  }
}

export class HasManyThroughCantAssociateThroughHasOneOrManyReflection extends ThroughCantAssociateThroughHasOneOrManyReflection {
  constructor(owner: string, association: string) {
    super(owner, association);
    this.name = "HasManyThroughCantAssociateThroughHasOneOrManyReflection";
  }
}

export class HasOneThroughCantAssociateThroughHasOneOrManyReflection extends ThroughCantAssociateThroughHasOneOrManyReflection {
  constructor(owner: string, association: string) {
    super(owner, association);
    this.name = "HasOneThroughCantAssociateThroughHasOneOrManyReflection";
  }
}

/**
 * Reflection-shaped object that `CompositePrimaryKeyMismatchError` derives its
 * message from. Rails (associations/errors.rb:190-200) is passed the real
 * reflection and branches on macro to pick `active_record_primary_key`
 * (has_one / collection) or `association_primary_key` (belongs_to). The
 * canonical `AbstractReflection#checkValidityBang` raise site passes the real
 * reflection, so we replicate that branch here. Trails-only defensive guards
 * (association-scope, collection-proxy, autosave, the inline association
 * loaders) don't hold a reflection — they pass a `primaryKey` they already
 * resolved, which takes precedence when no macro predicates are present.
 *
 * Rails raises this error from exactly one place,
 * `AbstractReflection#check_validity!` (reflection.rb:623,625), reached via
 * `Association#initialize` (association.rb:39) on first use. The trails-only
 * guard sites in `association-scope.ts`, `collection-proxy.ts`,
 * `autosave-association.ts` and `associations.ts` (inline-fallback /
 * scope-building / autosave / `:as` collapse paths) now route through that
 * canonical `checkValidityBang` first — via
 * `routeThroughCheckValidity` (validate-through-reflection.ts) — so a
 * resolvable reflection raises the Rails-faithful error derived from
 * `active_record_primary_key` / `association_primary_key`. The bare-guard
 * throw below each call remains only as a minimal fallback for paths that
 * genuinely cannot resolve a reflection (lower-level test helpers) or where a
 * polymorphic `:as` collapse has no Rails composite-key equivalent; dropping
 * it would surface a silent broken WHERE / `readAttribute(undefined)` instead
 * of a clear error. (RFC 0023 — story
 * `route-composite-pk-guards-through-check-validity`, converging the sites
 * audited in `composite-pk-mismatch-extra-guard-raise-sites`.)
 */
export interface CompositePrimaryKeyMismatchReflection {
  /** The owner — a model class (whose `name` builds the message) or its name. */
  activeRecord?: unknown;
  name?: string;
  foreignKey?: string | string[];
  /** Real-reflection accessors mirrored from Rails' constructor branch. */
  hasOne?: () => boolean;
  isCollection?: () => boolean;
  belongsTo?: () => boolean;
  activeRecordPrimaryKey?: string | string[];
  associationPrimaryKey?: () => string | string[];
  /** Pre-resolved key for trails-only guard sites that hold no reflection. */
  primaryKey?: string | string[];
}

function formatKey(key: string | string[]): string {
  return Array.isArray(key) ? `[${key.map((k) => `"${k}"`).join(", ")}]` : key;
}

/**
 * Resolve the primary key the message reports. Mirrors Rails' macro branch in
 * `CompositePrimaryKeyMismatchError#initialize` (errors.rb:192-196): a real
 * reflection uses `activeRecordPrimaryKey` for has_one/collection and
 * `associationPrimaryKey` for belongs_to; a bare guard object supplies its own
 * already-resolved `primaryKey`.
 *
 * @internal
 */
function reflectionPrimaryKey(
  reflection: CompositePrimaryKeyMismatchReflection,
): string | string[] | undefined {
  if (
    typeof reflection.hasOne === "function" ||
    typeof reflection.isCollection === "function" ||
    typeof reflection.belongsTo === "function"
  ) {
    if (reflection.hasOne?.() || reflection.isCollection?.()) {
      return reflection.activeRecordPrimaryKey;
    }
    return reflection.associationPrimaryKey?.();
  }
  return reflection.primaryKey;
}

/**
 * Mirrors Rails' `CompositePrimaryKeyMismatchError` (associations/errors.rb:187):
 * declares a `reflection` reader and derives the message from the passed
 * reflection inside the constructor, branching on the reflection's macro to
 * choose the primary key to report.
 *
 * Fidelity note: Rails 8.0.2 declares `attr_reader :reflection` but
 * `initialize` never assigns `@reflection` (errors.rb:190-200), so
 * `error.reflection` is always `nil`. We mirror that exactly — the reader
 * exists for API parity but is never populated from the constructor argument.
 */
export class CompositePrimaryKeyMismatchError extends ActiveRecordError {
  readonly reflection: CompositePrimaryKeyMismatchReflection | null = null;

  constructor(reflection?: CompositePrimaryKeyMismatchReflection | null) {
    let message: string;
    const primaryKey = reflection ? reflectionPrimaryKey(reflection) : undefined;
    if (
      reflection &&
      reflection.activeRecord != null &&
      reflection.name !== undefined &&
      primaryKey !== undefined &&
      reflection.foreignKey !== undefined
    ) {
      const owner =
        typeof reflection.activeRecord === "string"
          ? reflection.activeRecord
          : (reflection.activeRecord as { name?: string }).name;
      const pk = formatKey(primaryKey);
      const fk = formatKey(reflection.foreignKey);
      message = `Association ${owner}#${reflection.name} primary key ${pk} doesn't match with foreign key ${fk}. Please specify query_constraints, or primary_key and foreign_key values.`;
    } else {
      message = "Association primary key doesn't match with foreign key.";
    }
    super(message);
    this.name = "CompositePrimaryKeyMismatchError";
    // Rails never assigns @reflection (errors.rb:190-200); leave the reader null.
  }
}

export class AmbiguousSourceReflectionForThroughAssociation extends ActiveRecordError {
  constructor(owner: string, association: string, sources: string[]) {
    super(
      `Ambiguous source reflection for through association '${association}' on ${owner}. Possible sources: ${sources.join(", ")}. Specify :source to resolve.`,
    );
    this.name = "AmbiguousSourceReflectionForThroughAssociation";
  }
}

/**
 * Mirrors: `ThroughNestedAssociationsAreReadonly` (associations/errors.rb:224-232)
 * — built from the `(owner, reflection)` pair, deriving the message from
 * `owner.class.name` and `reflection.name`, with the argument-less fallback.
 */
export class ThroughNestedAssociationsAreReadonly extends ActiveRecordError {
  constructor(owner?: object | null, reflection?: { name: string } | null) {
    if (owner && reflection) {
      super(
        `Cannot modify association '${(owner.constructor as { name: string }).name}#${reflection.name}' because it goes through more than one other association.`,
      );
    } else {
      super("Through nested associations are read-only.");
    }
    this.name = "ThroughNestedAssociationsAreReadonly";
  }
}

export class HasManyThroughNestedAssociationsAreReadonly extends ThroughNestedAssociationsAreReadonly {
  constructor(owner?: object | null, reflection?: { name: string } | null) {
    super(owner, reflection);
    this.name = "HasManyThroughNestedAssociationsAreReadonly";
  }
}

export class HasOneThroughNestedAssociationsAreReadonly extends ThroughNestedAssociationsAreReadonly {
  constructor(owner?: object | null, reflection?: { name: string } | null) {
    super(owner, reflection);
    this.name = "HasOneThroughNestedAssociationsAreReadonly";
  }
}

export class EagerLoadPolymorphicError extends ActiveRecordError {
  readonly reflection: string;

  constructor(reflection: string) {
    super(`Cannot eagerly load the polymorphic association :${reflection}.`);
    this.name = "EagerLoadPolymorphicError";
    this.reflection = reflection;
  }
}

export class DeleteRestrictionError extends ActiveRecordError {
  constructor(name?: string | null) {
    super(
      name != null
        ? `Cannot delete record because of dependent ${name}`
        : "Delete restriction error.",
    );
    this.name = "DeleteRestrictionError";
  }
}

/**
 * Thrown when a `has_one` association is assigned by mass assignment —
 * `owner.assignAttributes({ account: x })`, `new Owner({ account: x })` — on a
 * *persisted* owner. (RFC 0087 §1 removed the native `=` setter that also
 * raised this. The mass-assignment arm is the campaign's deliberate residue:
 * Rails' `assign_attributes` returns nil and does its work inline
 * (`activemodel/lib/active_model/attribute_assignment.rb:32-35`), so trails'
 * `assignAttributes` stays synchronous too — which leaves this the only way to
 * report a write it cannot await.) This is a deliberate
 * trails-only deviation with no Rails counterpart: Rails'
 * `HasOneAssociation#replace` persists the displacement + new record inline at
 * assignment, which is synchronous DB I/O JS cannot do from a property setter.
 * Rather than silently deferring the writes to the owner's next `save()` — the
 * order-undefined two-row race RFC 0068 exists to kill — we throw loudly and
 * name the exact awaitable replacement. See RFC 0068-awaitable-has-one-setter
 * ("Why 'loud' beats 'deferred'") for the ergonomic-tradeoff decision.
 */
export class HasOnePersistedAssignmentError extends ActiveRecordError {
  readonly association: string;

  constructor(association: string) {
    const cap = association.charAt(0).toUpperCase() + association.slice(1);
    super(
      `Cannot assign has_one association \`${association}\` by mass assignment on a ` +
        `persisted record: Rails persists the replacement at assignment time, ` +
        `which requires \`await\` in JS. Use \`await owner.set${cap}(x)\` (or ` +
        `\`await owner.association("${association}").writer(x)\`).`,
    );
    this.name = "HasOnePersistedAssignmentError";
    this.association = association;
  }
}

/**
 * Thrown when a collection association (`has_many` / HABTM) is assigned by
 * mass assignment — `owner.assignAttributes({ items: [...] })`, `new Owner({
 * items: [...] })` — where Rails' `replace` would do DB I/O: a *persisted*
 * owner, or a new owner whose replace still owes a query (the unconditional
 * `load_target` once its primary key is set, or removing an already-persisted
 * record). (RFC 0087 §1 removed the native
 * `=` setter that also raised this; the mass-assignment arm is retired by that
 * RFC's `retire-sync-association-mass-assignment-arms`.) The collection analogue of
 * {@link HasOnePersistedAssignmentError}, and a deliberate trails-only
 * deviation with no Rails counterpart: Rails'
 * `CollectionAssociation#replace` diffs against the loaded target and runs the
 * deletes + inserts inline in a transaction (`replace_records`,
 * collection_association.rb:242), which is synchronous DB I/O JS cannot do
 * from a property setter. Rather than deferring those writes to the owner's
 * next `save()` — where a deferred delete can race an interim insert — we
 * throw loudly and name the awaitable Rails-named replacements. See RFC
 * 0068-awaitable-has-one-setter ("Why 'loud' beats 'deferred'").
 */
export class CollectionPersistedAssignmentError extends ActiveRecordError {
  readonly association: string;

  constructor(association: string) {
    super(
      `Cannot assign collection association \`${association}\` by mass assignment when the ` +
        `replace needs the database: Rails replaces the collection at assignment time, ` +
        `which requires \`await\` in JS. Use \`await owner.${association}.replace([...])\` ` +
        `(or \`.concat(...)\` / \`.destroy(...)\`).`,
    );
    this.name = "CollectionPersistedAssignmentError";
    this.association = association;
  }
}

/**
 * Thrown when a collection association's ids are assigned by mass assignment —
 * `owner.assignAttributes({ itemIds: [...] })`, `new Owner({ itemIds: [...] })`
 * — on *either* owner arm.
 *
 * The ids writer is stricter than {@link CollectionPersistedAssignmentError}'s
 * record writer, which only throws for a persisted owner: Rails' `ids_writer`
 * (collection_association.rb:61-83) *resolves the ids to records with a query*
 * before it replaces, so even the new-record arm — where the replace itself is
 * pure in-memory work — needs I/O mass assignment cannot await. Returning that
 * promise for the caller to discard made a bad id
 * (`raise_record_not_found_exception!`) surface as an unhandled rejection
 * rather than a catchable throw, and let an immediate `save()` race the
 * in-flight resolution. See RFC
 * 0068-awaitable-has-one-setter ("Why 'loud' beats 'deferred'").
 *
 * RFC 0087 §1 listed this class for deletion; it survives that campaign
 * deliberately, for the same reason {@link HasOnePersistedAssignmentError}
 * does — mass assignment is synchronous by design, so the ids arm keeps a
 * permanent caller.
 */
export class CollectionIdsAssignmentError extends ActiveRecordError {
  readonly association: string;

  constructor(association: string) {
    // The key that raised, derived here rather than passed in so the message
    // can never name a key that differs from the one mass assignment matched
    // (attribute-assignment.ts singularizes the same way).
    const idsName = `${singularize(association)}Ids`;
    super(
      `Cannot assign collection association \`${association}\` ids by mass assignment: ` +
        `Rails resolves the ids with a query and replaces the collection at ` +
        `assignment time, which requires \`await\` in JS. Use ` +
        `\`await owner.update({ ${idsName}: [...] })\` (or ` +
        `\`await owner.association("${association}").idsWriter([...])\`).`,
    );
    this.name = "CollectionIdsAssignmentError";
    this.association = association;
  }
}
