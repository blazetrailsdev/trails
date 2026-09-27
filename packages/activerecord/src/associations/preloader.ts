import type { Base } from "../base.js";
import type { Relation } from "../relation.js";
import { Autoload, extend, type Extended } from "@blazetrails/activesupport";
import { Associations } from "../namespaces.js";
import { Association } from "./preloader/association.js";
import { Branch } from "./preloader/branch.js";
import { Batch } from "./preloader/batch.js";
import { ThroughAssociation } from "./preloader/through-association.js";

export interface PreloaderOptions {
  records: Base[] | Relation<Base>;
  associations: any;
  scope?: any;
  availableRecords?: (Base | Base[])[];
  associateByDefault?: boolean;
}

/** @internal */
function isRelation(records: Base[] | Relation<Base>): records is Relation<Base> {
  return !Array.isArray(records) && typeof (records as any).toArray === "function";
}

export class Preloader {
  readonly records: Base[] | Relation<Base>;
  readonly associations: any;
  readonly scope: any;
  readonly associateByDefault: boolean;

  private _tree: Branch;
  private _availableRecords: (Base | Base[])[];
  private _materialized: boolean;

  /** @noRailsEquivalent PERMANENT */
  static new(options: PreloaderOptions): Preloader {
    return new this(options);
  }

  constructor(options: PreloaderOptions) {
    this.records = options.records;
    this.associations = options.associations;
    this.scope = options.scope ?? null;
    this.associateByDefault = options.associateByDefault ?? true;
    this._availableRecords = options.availableRecords ?? [];

    this._tree = new Branch({
      parent: null,
      association: null,
      children: this.associations,
      associateByDefault: this.associateByDefault,
      scope: this.scope,
    });
    this._materialized = !isRelation(this.records);
    if (this._materialized) {
      this._tree.setPreloadedRecords(this.records as Base[]);
    }
  }

  async isEmpty(): Promise<boolean> {
    if (this.associations == null) return true;
    await this.materialize();
    return (await this._tree.preloadedRecords()).length === 0;
  }

  private async materialize(): Promise<void> {
    if (this._materialized) return;
    this._tree.setPreloadedRecords(await (this.records as Relation<Base>));
    this._materialized = true;
  }

  async call(): Promise<Association[]> {
    const batch = new Batch([this], this._availableRecords);
    await batch.call();
    return this.loaders();
  }

  get branches(): Branch[] {
    return this._tree.children;
  }

  async loaders(): Promise<Association[]> {
    const loaders: Association[] = [];
    for (const branch of this.branches) {
      loaders.push(...(await branch.loaders()));
    }
    return loaders;
  }
}

// eslint-disable-next-line @typescript-eslint/no-namespace
export declare namespace Preloader {
  const loadPath: Autoload.Autoload["loadPath"];
  let Association: typeof import("./preloader/association.js").Association;
  let Batch: typeof import("./preloader/batch.js").Batch;
  let Branch: typeof import("./preloader/branch.js").Branch;
  let ThroughAssociation: typeof import("./preloader/through-association.js").ThroughAssociation;
  const autoload: Extended<typeof Autoload>["autoload"];
  const eagerAutoload: Extended<typeof Autoload>["eagerAutoload"];
  const eagerLoadBang: Extended<typeof Autoload>["eagerLoadBang"];
}
Object.defineProperty(Preloader, "name", { value: "ActiveRecord::Associations::Preloader" });
Object.assign(Preloader, {
  loadPath: {
    "active_record/associations/preloader/association": () => import("./preloader/association.js"),
    "active_record/associations/preloader/batch": () => import("./preloader/batch.js"),
    "active_record/associations/preloader/branch": () => import("./preloader/branch.js"),
    "active_record/associations/preloader/through_association": () =>
      import("./preloader/through-association.js"),
  },
});
extend(Preloader, Autoload);

Preloader.eagerAutoload(() => {
  Preloader.autoload("Association", "active_record/associations/preloader/association");
  Preloader.autoload("Batch", "active_record/associations/preloader/batch");
  Preloader.autoload("Branch", "active_record/associations/preloader/branch");
  Preloader.autoload(
    "ThroughAssociation",
    "active_record/associations/preloader/through_association",
  );
});
Preloader.Association = Association;
Preloader.Batch = Batch;
Preloader.Branch = Branch;
Preloader.ThroughAssociation = ThroughAssociation;

Associations.Preloader = Preloader;
