import { _setHasOneThroughAssociation } from "./association-class-slots.js";
import type { Base } from "../base.js";
import { HasOneAssociation } from "./has-one-association.js";
import { ThroughAssociation, sourceReflection } from "./through-association.js";

export class HasOneThroughAssociation extends HasOneAssociation {
  /** @internal */
  declare createThroughRecord: (record: Base | null, save: boolean) => void | Promise<void>;
  /** @internal */
  declare transaction: <R>(block: (tx?: any) => Promise<R>) => Promise<R | undefined>;
  /** @internal */
  declare throughReflection: () => unknown;
  /** @internal */
  declare throughAssociation: () => any;
  /** @internal */
  declare constructJoinAttributes: (...records: Base[]) => Record<string, unknown>;
  /** @internal */
  declare ensureMutable: () => void;
  /** @internal */
  declare ensureNotNested: () => void;

  /** @internal */
  protected override loadTargetForBuild(): Promise<unknown> {
    const throughProxy = this.throughAssociation() as {
      loadTarget?: () => unknown;
    } | null;
    return Promise.resolve(throughProxy?.loadTarget?.());
  }

  /** @internal */
  protected override async detachDisplacedTarget(): Promise<void> {}

  protected override setNewRecord(record: Base): void | Promise<void> {
    return this.replace(record, false);
  }

  /** @internal */
  protected override detachDisplacedOnBuild(): Promise<void> | null {
    return null;
  }

  /** @internal */
  protected override displacementNeedsAwait(): boolean {
    return false;
  }

  sourceReflection(): unknown {
    return sourceReflection(this);
  }

  protected override replace(record: Base | null, save = true): void | Promise<void> {
    const created = this.createThroughRecord(record, save);
    if (created) {
      return created.then(() => {
        this.target = record;
      });
    }
    this.target = record;
  }
}

/** @internal */
function createThroughRecord(
  this: HasOneThroughAssociation,
  record: Base | null,
  save: boolean,
): void | Promise<void> {
  this.ensureNotNested();

  const throughProxy = this.throughAssociation();
  const loaded = throughProxy.loadTarget();
  const withThroughRecord = (throughRecord: any): void | Promise<void> => {
    if (throughRecord && !record) {
      return throughRecord.destroy();
    } else if (record) {
      const attributes = this.constructJoinAttributes(record);

      const withCurrentThroughRecord = (throughRecord: any): void | Promise<void> => {
        if (throughRecord) {
          if (throughRecord.isNewRecord()) {
            return throughRecord.assignAttributes(attributes);
          } else {
            return throughRecord.update(attributes).then(() => {});
          }
        } else if ((this.owner as any).isNewRecord() || !save) {
          return buildThroughProxyRecord(throughProxy, attributes);
        } else {
          return throughProxy.create(attributes).then(() => {});
        }
      };

      if (throughRecord && throughRecord.isDestroyed()) {
        return Promise.resolve(throughProxy.reload()).then(() =>
          withCurrentThroughRecord(throughProxy.target),
        );
      }
      return withCurrentThroughRecord(throughRecord);
    }
  };
  return loaded instanceof Promise ? loaded.then(withThroughRecord) : withThroughRecord(loaded);
}

/** @internal */
function buildThroughProxyRecord(
  throughProxy: any,
  attrs: Record<string, unknown>,
): void | Promise<void> {
  const record = throughProxy.buildRecord?.(attrs);
  if (record) return throughProxy.setNewRecord?.(record);
}

Object.assign(HasOneThroughAssociation.prototype, {
  createThroughRecord,
  ...ThroughAssociation,
});

_setHasOneThroughAssociation(HasOneThroughAssociation);
