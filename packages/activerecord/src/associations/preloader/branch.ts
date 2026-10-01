import { ArgumentError } from "@blazetrails/activemodel";
import { wrap } from "@blazetrails/activesupport";
import { NoMethodError, rbObjClass, symbolToS, toSym, uniq } from "@blazetrails/ruby-compat";
import type { Base } from "../../base.js";
import type { AbstractReflection } from "../../reflection.js";
import { Association } from "./association.js";
import { ThroughAssociation } from "./through-association.js";

export interface BranchOptions {
  association: string | null;
  children: any;
  parent: Branch | null;
  associateByDefault: boolean;
  scope: any;
}

export class Branch {
  readonly association: string | null;
  readonly children: Branch[];
  readonly parent: Branch | null;
  readonly scope: any;
  readonly associateByDefault: boolean;

  private _preloadedRecords: Base[] | undefined;
  private _loaders: Association[] | null;
  private _polymorphic: boolean | undefined;

  constructor({ association, children, parent, associateByDefault, scope }: BranchOptions) {
    if (association != null) {
      try {
        this.association = symbolToS(toSym(association));
      } catch (error) {
        if (error instanceof NoMethodError) {
          throw new ArgumentError(
            `Association names must be Symbol or String, got: ${rbObjClass(association)}`,
          );
        }
        throw error;
      }
    } else {
      this.association = null;
    }
    this.parent = parent;
    this.scope = scope;
    this.associateByDefault = associateByDefault;

    this.children = this.buildChildren(children);
    this._loaders = null;
  }

  setPreloadedRecords(records: Base[]): void {
    this._preloadedRecords = records;
  }

  async preloadedRecords(): Promise<Base[]> {
    if (this._preloadedRecords !== undefined) return this._preloadedRecords;
    if (this.parent == null) {
      throw new Error("Root preloader branch requires preloadedRecords to be set before access");
    }
    const records: Base[] = [];
    for (const loader of await this.loaders()) {
      records.push(...(await loader.preloadedRecords()));
    }
    this._preloadedRecords = records;
    return this._preloadedRecords;
  }

  async futureClasses(): Promise<(typeof Base)[]> {
    const immediate = await this.immediateFutureClasses();
    const childClasses: (typeof Base)[] = [];
    for (const child of this.children) {
      childClasses.push(...(await child.futureClasses()));
    }
    const seen = new Set<typeof Base>();
    return [...immediate, ...childClasses].filter((k) => {
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }

  async immediateFutureClasses(): Promise<(typeof Base)[]> {
    if (this.parent!.isDone()) {
      const futureClasses: (typeof Base)[] = [];
      for (const loader of await this.loaders()) {
        futureClasses.push(...(await loader.futureClasses()));
      }
      return uniq(futureClasses);
    } else {
      return uniq(
        (await this.likelyReflections())
          .filter((reflection) => !reflection.isPolymorphic())
          .flatMap((reflection) => reflection.chain.map((r: AbstractReflection) => r.klass)),
      );
    }
  }

  async targetClasses(): Promise<(typeof Base)[]> {
    if (this.isDone()) {
      const seen = new Set<typeof Base>();
      return (await this.preloadedRecords())
        .map((r) => r.constructor as typeof Base)
        .filter((k) => {
          if (seen.has(k)) return false;
          seen.add(k);
          return true;
        });
    }

    if (this.parent!.isDone()) {
      const seen = new Set<typeof Base>();
      return (await this.loaders())
        .map((l) => l.klass)
        .filter((k) => {
          if (seen.has(k)) return false;
          seen.add(k);
          return true;
        });
    }

    const seen = new Set<typeof Base>();
    return (await this.likelyReflections())
      .filter((r) => !r.isPolymorphic())
      .map((r) => r.klass)
      .filter((k) => {
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
  }

  async likelyReflections(): Promise<AbstractReflection[]> {
    const parentClasses = await this.parent!.targetClasses();
    const result: AbstractReflection[] = [];
    for (const parentKlass of parentClasses) {
      const refl = parentKlass._reflectOnAssociation(this.association!);
      if (refl) result.push(refl);
    }
    return result;
  }

  isRoot(): boolean {
    return this.parent === null;
  }

  async sourceRecords(): Promise<Base[]> {
    if (this.isRoot()) return [];
    return this.parent!.preloadedRecords();
  }

  isDone(): boolean {
    return this.isRoot() || (this._loaders != null && this._loaders.every((l) => l.isRun()));
  }

  async runnableLoaders(): Promise<Association[]> {
    if (this.isRoot()) return [];
    const runnable: Association[] = [];
    for (const loader of await this.loaders()) {
      runnable.push(...(await loader.runnableLoaders()));
    }
    return runnable.filter((l) => !l.isRun());
  }

  async groupedRecords(): Promise<Map<AbstractReflection, Base[]>> {
    const h = new Map<AbstractReflection, Base[]>();
    const polymorphicParent = !this.isRoot() && (await this.parent!.isPolymorphic());

    for (const record of await this.sourceRecords()) {
      const reflection = (record.constructor as typeof Base)._reflectOnAssociation(
        this.association!,
      );

      if (
        (polymorphicParent && !reflection) ||
        !(record as any).association(this.association!).klass
      ) {
        continue;
      }

      const existing = h.get(reflection!);
      if (existing) {
        existing.push(record);
      } else {
        h.set(reflection!, [record]);
      }
    }
    return h;
  }

  preloadersForReflection(
    reflection: AbstractReflection,
    reflectionRecords: Base[],
  ): Association[] {
    const groups: {
      key: string;
      klass: typeof Base;
      reflectionScope: any;
      records: Base[];
    }[] = [];

    for (const record of reflectionRecords) {
      const klass: typeof Base = (record as any).association(this.association!).klass;

      let reflectionScope: any = undefined;
      if (reflection.scope && reflection.scope.length !== 0) {
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
      const existing = groups.find((g) => g.key === key);
      if (existing) {
        existing.records.push(record);
      } else {
        groups.push({ key, klass, reflectionScope, records: [record] });
      }
    }

    return groups.map(({ klass: rhsKlass, reflectionScope, records: rs }) => {
      const preloaderClass = this.preloaderFor(reflection);
      return new preloaderClass(
        rhsKlass,
        rs,
        reflection as any,
        this.scope,
        reflectionScope,
        this.associateByDefault,
      );
    });
  }

  async isPolymorphic(): Promise<boolean> {
    if (this.isRoot()) return false;
    if (this._polymorphic !== undefined) return this._polymorphic;

    this._polymorphic = (await this.sourceRecords()).some((record) => {
      const reflection = (record.constructor as typeof Base)._reflectOnAssociation(
        this.association!,
      );
      return reflection != null && reflection.isPolymorphic();
    });
    return this._polymorphic;
  }

  async loaders(): Promise<Association[]> {
    if (this._loaders !== null) return this._loaders;
    this._loaders = [...(await this.groupedRecords())].flatMap(([reflection, reflectionRecords]) =>
      this.preloadersForReflection(reflection, reflectionRecords),
    );
    return this._loaders;
  }

  private buildChildren(children: any): Branch[] {
    return wrap(children).flatMap((assoc: any) => {
      if (assoc == null) return [];

      if (Array.isArray(assoc)) {
        return this.buildChildren(assoc);
      }

      if (typeof assoc === "object" && assoc !== null) {
        return Object.keys(assoc).map(
          (parent) =>
            new Branch({
              parent: this,
              association: parent,
              children: assoc[parent],
              associateByDefault: this.associateByDefault,
              scope: this.scope,
            }),
        );
      }

      return [
        new Branch({
          parent: this,
          association: assoc,
          children: null,
          associateByDefault: this.associateByDefault,
          scope: this.scope,
        }),
      ];
    });
  }

  private preloaderFor(
    reflection: AbstractReflection,
  ): typeof Association | typeof ThroughAssociation {
    if ((reflection as any).options?.through) {
      return ThroughAssociation;
    }
    return Association;
  }
}
