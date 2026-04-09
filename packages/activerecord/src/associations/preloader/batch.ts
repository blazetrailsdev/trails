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

  constructor(preloaders: Preloader[], availableRecords: Base[] = []) {
    this._preloaders = preloaders.filter((p) => !p.isEmpty());
    this._availableRecords = new Map();
    for (const record of availableRecords.flat()) {
      const klass = record.constructor as typeof Base;
      const existing = this._availableRecords.get(klass);
      if (existing) {
        existing.push(record);
      } else {
        this._availableRecords.set(klass, [record]);
      }
    }
  }

  async call(): Promise<void> {
    let branches: Branch[] = this._preloaders.flatMap((p) => p.branches);

    while (branches.length > 0) {
      const loaders = branches.flatMap((b) => b.runnableLoaders());

      for (const loader of loaders) {
        const available = this._availableRecords.get(loader.klass);
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
      if (!(record as any)._preloadedAssociations) {
        (record as any)._preloadedAssociations = new Map();
      }
      if (!(record as any)._preloadedAssociations.has(branch.association)) {
        (record as any)._preloadedAssociations.set(branch.association, null);
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
