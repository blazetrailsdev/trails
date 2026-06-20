/**
 * Association-specific error classes.
 *
 * Mirrors: ActiveRecord::Associations error classes defined in
 * activerecord/lib/active_record/associations/errors.rb
 */
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

export class InverseOfAssociationNotFoundError extends ActiveRecordError {
  readonly reflection: string;
  readonly inverseOf: string;
  readonly corrections: string[];
  readonly associatedClass: string | null;

  constructor(
    reflection: string,
    inverseOf: string,
    corrections: string[] = [],
    associatedClass: string | null = null,
  ) {
    super(
      `Could not find the inverse association for ${reflection} (:${inverseOf}${
        associatedClass ? ` in ${associatedClass}` : ""
      })`,
    );
    this.name = "InverseOfAssociationNotFoundError";
    this.reflection = reflection;
    this.inverseOf = inverseOf;
    this.corrections = corrections;
    this.associatedClass = associatedClass;
  }

  detailedMessage(): string {
    return withCorrections(this.message, this.corrections);
  }
}

export class InverseOfAssociationRecursiveError extends ActiveRecordError {
  readonly reflection: string;
  readonly inverseOf: string;

  constructor(reflection: string, inverseOf: string, associatedClass: string | null = null) {
    super(
      `Inverse association ${reflection} (:${inverseOf}${
        associatedClass ? ` in ${associatedClass}` : ""
      }) is recursive.`,
    );
    this.name = "InverseOfAssociationRecursiveError";
    this.reflection = reflection;
    this.inverseOf = inverseOf;
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
 * message from. Mirrors the slice of `AbstractReflection` Rails' error reads:
 * `active_record` (the owner class, whose `name` builds the message), `name`,
 * the resolved primary key, and the foreign key. `activeRecord` may be the
 * class itself or its name string so callers can pass either the real
 * reflection's class or a bare owner name.
 */
export interface CompositePrimaryKeyMismatchReflection {
  activeRecord?: { name?: string } | string | null;
  name?: string;
  primaryKey?: string | string[];
  foreignKey?: string | string[];
}

function formatKey(key: string | string[]): string {
  return Array.isArray(key) ? `[${key.map((k) => `"${k}"`).join(", ")}]` : key;
}

/**
 * Mirrors Rails' `CompositePrimaryKeyMismatchError` (associations/errors.rb:182):
 * stores the reflection via `attr_reader :reflection` and derives the message
 * from it inside the constructor. We accept a reflection-shaped object carrying
 * the already-resolved primary/foreign keys (each raise site computes the pair
 * it is checking) rather than the flat string args we used before.
 */
export class CompositePrimaryKeyMismatchError extends ActiveRecordError {
  readonly reflection: CompositePrimaryKeyMismatchReflection | null;

  constructor(reflection?: CompositePrimaryKeyMismatchReflection | null) {
    let message: string;
    if (
      reflection &&
      reflection.activeRecord != null &&
      reflection.name !== undefined &&
      reflection.primaryKey !== undefined &&
      reflection.foreignKey !== undefined
    ) {
      const owner =
        typeof reflection.activeRecord === "string"
          ? reflection.activeRecord
          : reflection.activeRecord.name;
      const pk = formatKey(reflection.primaryKey);
      const fk = formatKey(reflection.foreignKey);
      message = `Association ${owner}#${reflection.name} primary key ${pk} doesn't match with foreign key ${fk}. Please specify query_constraints, or primary_key and foreign_key values.`;
    } else {
      message = "Association primary key doesn't match with foreign key.";
    }
    super(message);
    this.name = "CompositePrimaryKeyMismatchError";
    this.reflection = reflection ?? null;
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

export class ThroughNestedAssociationsAreReadonly extends ActiveRecordError {
  constructor(owner: string, association: string) {
    super(
      `Cannot modify association '${association}' on ${owner} because it goes through a nested through association.`,
    );
    this.name = "ThroughNestedAssociationsAreReadonly";
  }
}

export class HasManyThroughNestedAssociationsAreReadonly extends ThroughNestedAssociationsAreReadonly {
  constructor(owner: string, association: string) {
    super(owner, association);
    this.name = "HasManyThroughNestedAssociationsAreReadonly";
  }
}

export class HasOneThroughNestedAssociationsAreReadonly extends ThroughNestedAssociationsAreReadonly {
  constructor(owner: string, association: string) {
    super(owner, association);
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
  readonly record: any;
  readonly association: string;

  constructor(record: any, association: string) {
    super(`Cannot delete record because of dependent ${association}`);
    this.name = "DeleteRestrictionError";
    this.record = record;
    this.association = association;
  }
}
