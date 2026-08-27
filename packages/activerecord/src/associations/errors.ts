import { singularize } from "@blazetrails/activesupport";
import { SpellChecker } from "@blazetrails/did-you-mean";
import { ActiveRecordError, ConfigurationError } from "../errors.js";

/** @internal */
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

  detailedMessage(): string {
    return withCorrections(this.message, this.corrections);
  }
}

/** @internal */
interface InverseOfReflection {
  readonly name: string;
  readonly options: Record<string, unknown>;
  readonly className: string;
  readonly klass: InverseOfAssociatedClass;
}

/** @internal */
interface InverseOfAssociatedClass {
  readonly name: string;
  reflections(): Readonly<Record<string, unknown>>;
}

/** @internal */
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

export interface CompositePrimaryKeyMismatchReflection {
  activeRecord?: unknown;
  name?: string;
  foreignKey?: string | string[];
  hasOne?: () => boolean;
  isCollection?: () => boolean;
  belongsTo?: () => boolean;
  activeRecordPrimaryKey?: string | string[];
  associationPrimaryKey?: () => string | string[];
  primaryKey?: string | string[];
}

function formatKey(key: string | string[]): string {
  return Array.isArray(key) ? `[${key.map((k) => `"${k}"`).join(", ")}]` : key;
}

/** @internal */
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

export class CollectionIdsAssignmentError extends ActiveRecordError {
  readonly association: string;

  constructor(association: string) {
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
