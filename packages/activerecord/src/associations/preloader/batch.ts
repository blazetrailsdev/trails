import type { Base } from "../../base.js";
import type { Preloader } from "../preloader.js";
import type { Association } from "./association.js";
import type { Branch } from "./branch.js";
import { ThroughAssociation } from "./through-association.js";

/**
 * Orchestrates loading multiple preloader branches together.
 * Walks the Branch tree, finding runnable loaders and executing
 * them in groups until all branches are complete.
 *
 * Mirrors: ActiveRecord::Associations::Preloader::Batch
 */
export class Batch {
  private _preloaders: Preloader[];
  private _availableRecords: Map<typeof Base, Base[]>;

  constructor(preloaders: Preloader[], availableRecords: (Base | Base[])[] = []) {
    // Empty preloaders are rejected in `call()` — `isEmpty()` is async because
    // it may materialize a Relation, mirroring Rails' `records.length`.
    this._preloaders = preloaders;
    this._availableRecords = new Map();
    for (const record of availableRecords.flat()) {
      const klass = (record.constructor as typeof Base).baseClass;
      const existing = this._availableRecords.get(klass);
      if (existing) {
        existing.push(record);
      } else {
        this._availableRecords.set(klass, [record]);
      }
    }
  }

  async call(): Promise<void> {
    const active: Preloader[] = [];
    for (const preloader of this._preloaders) {
      if (!(await preloader.isEmpty())) active.push(preloader);
    }
    this._preloaders = active;

    let branches: Branch[] = this._preloaders.flatMap((p) => p.branches);

    while (branches.length > 0) {
      const loaders = branches.flatMap((b) => b.runnableLoaders());

      for (const loader of loaders) {
        const available = this._availableRecords.get(loader.klass.baseClass);
        loader.associateRecordsFromUnscoped(available);
      }

      if (loaders.length > 0) {
        const futureTables = new Set(
          branches.flatMap((branch) => {
            const futureClasses = branch.futureClasses();
            const runnableClasses = branch.runnableLoaders().map((l) => l.klass);
            return futureClasses
              .filter((k) => !runnableClasses.includes(k))
              .map((k) => k.tableName);
          }),
        );

        let targetLoaders = loaders.filter((l) => !futureTables.has(l.tableName));
        if (targetLoaders.length === 0) targetLoaders = loaders;

        await this._groupAndLoadSimilar(targetLoaders);
        for (const loader of targetLoaders) {
          await loader.run();
        }
      }

      const finished: Branch[] = [];
      const inProgress: Branch[] = [];
      for (const branch of branches) {
        if (branch.isDone()) {
          this._setDefaultsForUncoveredRecords(branch);
          finished.push(branch);
        } else {
          inProgress.push(branch);
        }
      }

      branches = [...inProgress, ...finished.flatMap((b) => b.children)];
    }
  }

  private _setDefaultsForUncoveredRecords(branch: Branch): void {
    if (branch.isRoot() || !branch.association) return;

    const coveredRecords = new Set<Base>();
    for (const loader of branch.loaders) {
      for (const owner of loader.owners) {
        coveredRecords.add(owner);
      }
    }

    for (const record of branch.sourceRecords) {
      if (coveredRecords.has(record)) continue;
      // Record a preloaded-nil default on the real holder so readers gating on
      // `holder.isLoaded() && _loadedFromPreload` see it (RFC 0022).
      //
      // `association(branch.association)` throws only for a record whose class
      // does not declare `branch.association` — exactly the
      // `polymorphicParent && !reflection` records that `Branch#groupedRecords`
      // skips (and so leaves uncovered) without ever resolving a holder. Those
      // records have no reader for the association at all, so a holder-resident
      // nil-default would be unreadable anyway; the old shadow-map entry was
      // equally dead for them. Hence the catch is purely defensive — no reader
      // asymmetry results from skipping the holder write here.
      try {
        const association = (record as any).association(branch.association);
        if (!association.isLoaded()) {
          association.setTarget(null);
          association._loadedFromPreload = true;
        }
      } catch {
        // Association not declared on this record's class (see above).
      }
    }
  }

  private async _groupAndLoadSimilar(loaders: Association[]): Promise<void> {
    const nonThroughLoaders = loaders.filter((l) => !(l instanceof ThroughAssociation));

    const groups = new Map<
      string,
      { query: ReturnType<Association["loaderQuery"]>; loaders: Association[] }
    >();
    for (const loader of nonThroughLoaders) {
      const query = loader.loaderQuery();
      const key = query.hashKey();
      const existing = groups.get(key);
      if (existing) {
        existing.loaders.push(loader);
      } else {
        groups.set(key, { query, loaders: [loader] });
      }
    }

    for (const { query, loaders: similarLoaders } of groups.values()) {
      await query.loadRecordsInBatch(similarLoaders);
    }
  }
}

/** @internal */
function loaders(batch: Batch): unknown[] {
  return (batch as any)._preloaders ?? [];
}

/** @internal */
function groupAndLoadSimilar(batch: Batch, loaderList: unknown[]): Promise<void> {
  return (batch as any)._groupAndLoadSimilar?.(loaderList) ?? Promise.resolve();
}
