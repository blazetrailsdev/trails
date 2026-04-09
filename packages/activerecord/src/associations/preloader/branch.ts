import type { Base } from "../../base.js";
import type { AbstractReflection } from "../../reflection.js";
import { _reflectOnAssociation } from "../../reflection.js";
import { Association } from "./association.js";
import { ThroughAssociation } from "./through-association.js";

export interface BranchOptions {
  association: string | symbol | null;
  children: any;
  parent: Branch | null;
  associateByDefault: boolean;
  scope: any;
}

/**
 * Represents a single branch in the preloader tree — one association
 * on a set of records, potentially with nested children.
 *
 * Mirrors: ActiveRecord::Associations::Preloader::Branch
 */
export class Branch {
  readonly association: string | null;
  readonly children: Branch[];
  readonly parent: Branch | null;
  readonly scope: any;
  readonly associateByDefault: boolean;

  private _preloadedRecords: Base[] | undefined;
  private _loaders: Association[] | null;
  private _polymorphic: boolean | undefined;

  constructor(options: BranchOptions) {
    this.association = this._normalizeAssociationName(options.association);
    this.parent = options.parent;
    this.scope = options.scope;
    this.associateByDefault = options.associateByDefault;
    this.children = this._buildChildren(options.children);
    this._loaders = null;
  }

  set preloadedRecords(records: Base[]) {
    this._preloadedRecords = records;
  }

  get preloadedRecords(): Base[] {
    if (this._preloadedRecords !== undefined) return this._preloadedRecords;
    if (this.parent == null) {
      throw new Error("Root preloader branch requires preloadedRecords to be set before access");
    }
    this._preloadedRecords = this.loaders.flatMap((l) => l.preloadedRecords);
    return this._preloadedRecords;
  }

  futureClasses(): (typeof Base)[] {
    const immediate = this.immediateFutureClasses();
    const childClasses = this.children.flatMap((c) => c.futureClasses());
    const seen = new Set<typeof Base>();
    return [...immediate, ...childClasses].filter((k) => {
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }

  immediateFutureClasses(): (typeof Base)[] {
    if (this.parent == null) {
      return [];
    }

    if (this.parent.isDone()) {
      const seen = new Set<typeof Base>();
      return this.loaders
        .flatMap((l) => l.futureClasses())
        .filter((k) => {
          if (seen.has(k)) return false;
          seen.add(k);
          return true;
        });
    }

    const seen = new Set<typeof Base>();
    return this.likelyReflections()
      .filter((r) => !r.isPolymorphic())
      .flatMap((r) => r.chain.map((c: AbstractReflection) => c.klass))
      .filter((k) => {
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
  }

  targetClasses(): (typeof Base)[] {
    if (this.isDone()) {
      const seen = new Set<typeof Base>();
      return this.preloadedRecords
        .map((r) => r.constructor as typeof Base)
        .filter((k) => {
          if (seen.has(k)) return false;
          seen.add(k);
          return true;
        });
    }

    if (this.parent!.isDone()) {
      const seen = new Set<typeof Base>();
      return this.loaders
        .map((l) => l.klass)
        .filter((k) => {
          if (seen.has(k)) return false;
          seen.add(k);
          return true;
        });
    }

    const seen = new Set<typeof Base>();
    return this.likelyReflections()
      .filter((r) => !r.isPolymorphic())
      .map((r) => r.klass)
      .filter((k) => {
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
  }

  likelyReflections(): AbstractReflection[] {
    const parentClasses = this.parent!.targetClasses();
    const result: AbstractReflection[] = [];
    for (const parentKlass of parentClasses) {
      const refl = _reflectOnAssociation(parentKlass, this.association!);
      if (refl) result.push(refl);
    }
    return result;
  }

  isRoot(): boolean {
    return this.parent === null;
  }

  get sourceRecords(): Base[] {
    if (this.isRoot()) return [];
    return this.parent!.preloadedRecords;
  }

  isDone(): boolean {
    return this.isRoot() || (this._loaders != null && this._loaders.every((l) => l.isRun()));
  }

  runnableLoaders(): Association[] {
    if (this.isRoot()) return [];
    return this.loaders.flatMap((l) => l.runnableLoaders()).filter((l) => !l.isRun());
  }

  groupedRecords(): Map<AbstractReflection, Base[]> {
    const h = new Map<AbstractReflection, Base[]>();

    for (const record of this.sourceRecords) {
      const reflection = _reflectOnAssociation(
        record.constructor as typeof Base,
        this.association!,
      );

      if (!reflection) continue;

      try {
        if (!(record as any).association(this.association!).klass) continue;
      } catch {
        continue;
      }

      const existing = h.get(reflection);
      if (existing) {
        existing.push(record);
      } else {
        h.set(reflection, [record]);
      }
    }
    return h;
  }

  preloadersForReflection(
    reflection: AbstractReflection,
    reflectionRecords: Base[],
  ): Association[] {
    const groups = new Map<string, { klass: typeof Base; reflectionScope: any; records: Base[] }>();

    for (const record of reflectionRecords) {
      const klass: typeof Base = (record as any).association(this.association!).klass;

      let reflectionScope: any = undefined;
      if (reflection.scope) {
        const scopes = (reflection as any).joinScopes(
          klass.arelTable,
          (klass as any).predicateBuilder,
          klass,
          record,
        );
        if (scopes && scopes.length > 0) {
          reflectionScope = scopes.reduce((acc: any, s: any) => acc.merge(s));
        }
      }

      const scopeKey =
        reflectionScope?.toSql?.() ?? (reflectionScope == null ? "" : String(reflectionScope));
      const key = `${klass.name}::${scopeKey}`;
      const existing = groups.get(key);
      if (existing) {
        existing.records.push(record);
      } else {
        groups.set(key, { klass, reflectionScope, records: [record] });
      }
    }

    const PreloaderClass = this._preloaderFor(reflection);
    const result: Association[] = [];
    for (const { klass, reflectionScope, records } of groups.values()) {
      result.push(
        new PreloaderClass(
          klass,
          records,
          reflection as any,
          this.scope,
          reflectionScope,
          this.associateByDefault,
        ),
      );
    }
    return result;
  }

  isPolymorphic(): boolean {
    if (this.isRoot()) return false;
    if (this._polymorphic !== undefined) return this._polymorphic;

    this._polymorphic = this.sourceRecords.some((record) => {
      const reflection = _reflectOnAssociation(
        record.constructor as typeof Base,
        this.association!,
      );
      return reflection != null && reflection.isPolymorphic();
    });
    return this._polymorphic;
  }

  get loaders(): Association[] {
    if (this._loaders !== null) return this._loaders;
    this._loaders = [];
    for (const [reflection, records] of this.groupedRecords()) {
      this._loaders.push(...this.preloadersForReflection(reflection, records));
    }
    return this._loaders;
  }

  private _buildChildren(children: any): Branch[] {
    if (children == null) return [];

    const arr = Array.isArray(children) ? children : [children];
    return arr.flatMap((assoc) => {
      if (typeof assoc === "string" || typeof assoc === "symbol") {
        return [
          new Branch({
            parent: this,
            association: assoc,
            children: null,
            associateByDefault: this.associateByDefault,
            scope: this.scope,
          }),
        ];
      }

      if (typeof assoc === "object" && assoc !== null && !Array.isArray(assoc)) {
        return Reflect.ownKeys(assoc)
          .filter((k): k is string | symbol => typeof k === "string" || typeof k === "symbol")
          .map(
            (parent) =>
              new Branch({
                parent: this,
                association: parent,
                children: (assoc as any)[parent],
                associateByDefault: this.associateByDefault,
                scope: this.scope,
              }),
          );
      }

      throw new TypeError(`Invalid association specifier: ${typeof assoc}`);
    });
  }

  private _normalizeAssociationName(association: string | symbol | null): string | null {
    if (association == null) return null;
    if (typeof association === "symbol") {
      const description = association.description;
      if (description == null || description.length === 0) {
        throw new TypeError("Association symbol must have a non-empty description");
      }
      return description;
    }
    return String(association);
  }

  private _preloaderFor(
    reflection: AbstractReflection,
  ): typeof Association | typeof ThroughAssociation {
    if ((reflection as any).options?.through) {
      return ThroughAssociation;
    }
    if ((reflection as any).isThroughReflection?.()) {
      return ThroughAssociation;
    }
    // HABTM stores through in _associations, not on reflection
    const model = (reflection as any).activeRecord;
    if (model?._associations) {
      const assocDef = (model._associations as any[]).find(
        (a: any) => a.name === (reflection as any).name,
      );
      if (assocDef?.options?.through) {
        return ThroughAssociation;
      }
    }
    return Association;
  }
}
