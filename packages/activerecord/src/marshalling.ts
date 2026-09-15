import { ArgumentError } from "@blazetrails/activemodel";
import { isPresent } from "@blazetrails/activesupport";
import { AssociationNotFoundError } from "./associations/errors.js";

let _formatVersion: number = 6.1;

export function formatVersion(): number {
  return _formatVersion;
}

export function setFormatVersion(version: number): void {
  switch (version) {
    case 6.1:
      if ("marshalDump" in Methods) delete (Methods as { marshalDump?: unknown }).marshalDump;
      break;
    case 7.1:
      (Methods as { marshalDump?: unknown }).marshalDump = Methods._marshalDump71;
      break;
    default:
      throw new ArgumentError(`Unknown marshalling format: ${String(version)}`);
  }
  _formatVersion = version;
}

interface MarshallingReflection {
  name: string;
}

interface MarshallingAssociation {
  isLoaded(): boolean;
  target: unknown;
}

interface MarshallingHost {
  constructor: {
    reflectOnAllAssociations(): MarshallingReflection[];
    attributesBuilder(): { buildFromDatabase(values: Record<string, unknown>): unknown };
  };
  attributesForDatabase(): Record<string, unknown>;
  isNewRecord(): boolean;
  isAssociationCached(name: string): boolean;
  association(name: string): MarshallingAssociation;
  initWithAttributes(attributes: unknown, newRecord: boolean): void;
}

function _marshalDump71(this: MarshallingHost): unknown[] {
  const payload: unknown[] = [this.attributesForDatabase(), this.isNewRecord()];

  const cachedAssociations = this.constructor.reflectOnAllAssociations().filter((reflection) => {
    if (this.isAssociationCached(reflection.name)) {
      const association = this.association(reflection.name);
      return association.isLoaded() || isPresent(association.target);
    }
    return false;
  });

  if (cachedAssociations.length !== 0) {
    payload.push(
      cachedAssociations.map((reflection) => [
        reflection.name,
        this.association(reflection.name).target,
      ]),
    );
  }

  return payload;
}

function marshalLoad(this: MarshallingHost, state: unknown[]): void {
  const [attributesFromDatabase, newRecord, associations] = state as [
    Record<string, unknown>,
    boolean,
    [string, unknown][] | undefined,
  ];

  const attributes = this.constructor.attributesBuilder().buildFromDatabase(attributesFromDatabase);
  this.initWithAttributes(attributes, newRecord);

  if (associations != null) {
    for (const [name, target] of associations) {
      try {
        this.association(name).target = target;
      } catch (e) {
        if (!(e instanceof AssociationNotFoundError)) throw e;
      }
    }
  }
}

export const Methods = { _marshalDump71, marshalLoad };
