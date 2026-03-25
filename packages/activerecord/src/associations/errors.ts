/**
 * Association-specific error classes.
 *
 * Mirrors: ActiveRecord::Associations::Errors
 */

export class DeleteRestrictionError extends Error {
  readonly record: any;
  readonly association: string;

  constructor(record: any, association: string) {
    super(`Cannot delete record because of dependent ${association}`);
    this.name = "DeleteRestrictionError";
    this.record = record;
    this.association = association;
  }
}

/**
 * Mirrors: ActiveRecord::InverseOfAssociationNotFoundError
 */
export class InverseOfAssociationNotFoundError extends Error {
  readonly reflection: string;
  readonly inverseOf: string;
  readonly corrections: string[];

  constructor(reflection: string, inverseOf: string, corrections: string[] = []) {
    const suggestion = corrections.length > 0 ? `\nDid you mean? ${corrections.join(", ")}` : "";
    super(
      `Could not find the inverse association for ${reflection} (inverse_of: :${inverseOf}).${suggestion}`,
    );
    this.name = "InverseOfAssociationNotFoundError";
    this.reflection = reflection;
    this.inverseOf = inverseOf;
    this.corrections = corrections;
  }

  detailedMessage(): string {
    return this.message;
  }
}

export class HasManyThroughCantAssociateThroughHasOneOrManyReflection extends Error {
  constructor(owner: string, association: string) {
    super(
      `Cannot modify association '${association}' on ${owner} because the source reflection is through a has_one or has_many reflection.`,
    );
    this.name = "HasManyThroughCantAssociateThroughHasOneOrManyReflection";
  }
}

export class HasManyThroughNestedAssociationsAreReadonly extends Error {
  constructor(owner: string, association: string) {
    super(
      `Cannot modify association '${association}' on ${owner} because it goes through a nested through association.`,
    );
    this.name = "HasManyThroughNestedAssociationsAreReadonly";
  }
}

export class HasOneThroughNestedAssociationsAreReadonly extends Error {
  constructor(owner: string, association: string) {
    super(
      `Cannot modify association '${association}' on ${owner} because it goes through a nested through association.`,
    );
    this.name = "HasOneThroughNestedAssociationsAreReadonly";
  }
}

export class HasManyThroughOrderError extends Error {
  constructor(owner: string, association: string, through: string) {
    super(
      `Cannot have a has_many :through association '${association}' on ${owner} which goes through '${through}' before the through association is defined.`,
    );
    this.name = "HasManyThroughOrderError";
  }
}
