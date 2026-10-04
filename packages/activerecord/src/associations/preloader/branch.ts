import { ArgumentError } from "@blazetrails/activemodel";
import { wrap } from "@blazetrails/activesupport";
import {
  groupBy,
  NoMethodError,
  rbObjClassname,
  rtest,
  symbolToS,
  toSym,
  uniq,
} from "@blazetrails/ruby-compat";
import type { Base } from "../../base.js";
import type { Relation } from "../../relation.js";
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

  private _preloadedRecords: Base[] | Relation<Base> | undefined;
  private _loaders: Association[] | null;
  private _polymorphic: boolean | undefined;

  constructor({ association, children, parent, associateByDefault, scope }: BranchOptions) {
    if (rtest(association)) {
      try {
        this.association = symbolToS(toSym(association));
      } catch (error) {
        if (error instanceof NoMethodError) {
          throw new ArgumentError(
            `Association names must be Symbol or String, got: ${rbObjClassname(association)}`,
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

  setPreloadedRecords(records: Base[] | Relation<Base>): void {
    this._preloadedRecords = records;
  }

  async preloadedRecords(): Promise<Base[]> {
    this._preloadedRecords ??= await (async () => {
      const preloadedRecords: Base[][] = [];
      for (const loader of await this.loaders()) {
        preloadedRecords.push(await loader.preloadedRecords());
      }
      return preloadedRecords.flat();
    })();
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
      const futureClasses: (typeof Base)[][] = [];
      for (const loader of await this.loaders()) futureClasses.push(await loader.futureClasses());
      return uniq(futureClasses.flat());
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
    return this.parent!.preloadedRecords();
  }

  isDone(): boolean {
    return this.isRoot() || (this._loaders != null && this._loaders.every((l) => l.isRun()));
  }

  async runnableLoaders(): Promise<Association[]> {
    const runnableLoaders: Association[][] = [];
    for (const loader of await this.loaders()) runnableLoaders.push(await loader.runnableLoaders());
    return runnableLoaders.flat().filter((l) => !l.isRun());
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

      (h.get(reflection!) ?? h.set(reflection!, []).get(reflection!)!).push(record);
    }
    return h;
  }

  preloadersForReflection(
    reflection: AbstractReflection,
    reflectionRecords: Base[],
  ): Association[] {
    return [
      ...groupBy(reflectionRecords, (record) => {
        const klass: typeof Base = (record as any).association(this.association!).klass;

        let reflectionScope: any;
        if (reflection.scope != null && reflection.scope.length !== 0) {
          reflectionScope = (reflection as any)
            .joinScopes(klass.arelTable, (klass as any).predicateBuilder, klass, record)
            .reduce((memo: any, scope: any) => memo.mergeBang(scope));
        }

        return [klass, reflectionScope] as const;
      }),
    ].map(
      ([[rhsKlass, reflectionScope], rs]) =>
        new (this.preloaderFor(reflection))(
          rhsKlass,
          rs,
          reflection as any,
          this.scope,
          reflectionScope,
          this.associateByDefault,
        ),
    );
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
    return (this._loaders ??= [...(await this.groupedRecords())].flatMap(
      ([reflection, reflectionRecords]) =>
        this.preloadersForReflection(reflection, reflectionRecords),
    ));
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
    if ((reflection as any).options.through != null) {
      return ThroughAssociation;
    } else {
      return Association;
    }
  }
}
