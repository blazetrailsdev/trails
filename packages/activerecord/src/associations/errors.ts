/**
 * Association-specific error classes.
 *
 * Mirrors: ActiveRecord::Associations error classes defined in
 * activerecord/lib/active_record/associations/errors.rb
 */
import { ActiveRecordError, ConfigurationError } from "../errors.js";

export class AssociationNotFoundError extends ConfigurationError {
  readonly record: any;
  readonly associationName: string;

  constructor(record: any, associationName: string) {
    super(
      `Association named '${associationName}' was not found on ${record?.constructor?.name ?? record}; perhaps you misspelled it?`,
    );
    this.name = "AssociationNotFoundError";
    this.record = record;
    this.associationName = associationName;
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
    const suggestion = corrections.length > 0 ? `\nDid you mean? ${corrections.join(", ")}` : "";
    super(
      `Could not find the inverse association for ${reflection} (inverse_of: :${inverseOf}).${suggestion}`,
    );
    this.name = "InverseOfAssociationNotFoundError";
    this.reflection = reflection;
    this.inverseOf = inverseOf;
    this.corrections = corrections;
    this.associatedClass = associatedClass;
  }

  detailedMessage(): string {
    return this.message;
  }
}

export class InverseOfAssociationRecursiveError extends ActiveRecordError {
  readonly reflection: string;
  readonly inverseOf: string;

  constructor(reflection: string, inverseOf: string) {
    super(
      `Inverse association ${inverseOf} for ${reflection} is recursive. The inverse association must not be ${reflection}.`,
    );
    this.name = "InverseOfAssociationRecursiveError";
    this.reflection = reflection;
    this.inverseOf = inverseOf;
  }
}

export class HasManyThroughAssociationNotFoundError extends ActiveRecordError {
  readonly ownerClass: string;
  readonly reflection: string;

  constructor(owner: string, through: string, reflection: string = through) {
    super(`Could not find the association :${through} in model ${owner}`);
    this.name = "HasManyThroughAssociationNotFoundError";
    this.ownerClass = owner;
    this.reflection = reflection;
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

export class CompositePrimaryKeyMismatchError extends ActiveRecordError {
  constructor(owner: string, association: string) {
    super(`Association ${association} on ${owner} has a composite primary key mismatch.`);
    this.name = "CompositePrimaryKeyMismatchError";
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
