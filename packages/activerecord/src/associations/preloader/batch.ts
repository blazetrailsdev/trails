import type { Base } from "../../base.js";
import type { Preloader } from "../preloader.js";
import type { Association } from "./association.js";
import type { Branch } from "./branch.js";
import { groupBy } from "@blazetrails/activesupport";
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
    this._availableRecords = groupBy(
      availableRecords.flat(),
      (r) => (r.constructor as typeof Base).baseClass,
    );
  }

  async call(): Promise<void> {
    const active: Preloader[] = [];
    for (const preloader of this._preloaders) {
      if (!(await preloader.isEmpty())) active.push(preloader);
    }
    this._preloaders = active;

    let branches: Branch[] = this._preloaders.flatMap((p) => p.branches);

    while (branches.length > 0) {
      const loaders: Association[] = [];
      for (const branch of branches) {
        loaders.push(...(await branch.runnableLoaders()));
      }

      for (const loader of loaders) {
        const available = this._availableRecords.get(loader.klass.baseClass);
        loader.associateRecordsFromUnscoped(available);
      }

      if (loaders.length > 0) {
        const futureTables = new Set<string>();
        for (const branch of branches) {
          const futureClasses = await branch.futureClasses();
          const runnableClasses = (await branch.runnableLoaders()).map((l) => l.klass);
          for (const k of futureClasses) {
            if (!runnableClasses.includes(k)) futureTables.add(k.tableName);
          }
        }

        let targetLoaders = loaders.filter((l) => !futureTables.has(l.tableName));
        if (targetLoaders.length === 0) targetLoaders = loaders;

        await this.groupAndLoadSimilar(targetLoaders);
        for (const loader of targetLoaders) {
          await loader.run();
        }
      }

      const finished: Branch[] = [];
      const inProgress: Branch[] = [];
      for (const branch of branches) {
        if (branch.isDone()) {
          await this._setDefaultsForUncoveredRecords(branch);
          finished.push(branch);
        } else {
          inProgress.push(branch);
        }
      }

      branches = [...inProgress, ...finished.flatMap((b) => b.children)];
    }
  }

  private async _setDefaultsForUncoveredRecords(branch: Branch): Promise<void> {
    if (branch.isRoot() || !branch.association) return;

    const coveredRecords = new Set<Base>();
    for (const loader of await branch.loaders()) {
      for (const owner of loader.owners) {
        coveredRecords.add(owner);
      }
    }

    for (const record of await branch.sourceRecords()) {
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
          // Loader writeback (preload miss) — must not trip the in-flight
          // guard. See Association#_setTargetFromLoader.
          association._setTargetFromLoader(null);
          association._loadedFromPreload = true;
        }
      } catch {
        // Association not declared on this record's class (see above).
      }
    }
  }

  private async groupAndLoadSimilar(loaders: Association[]): Promise<void> {
    const nonThroughLoaders = loaders.filter((l) => !(l instanceof ThroughAssociation));
    // Rails groups on the LoaderQuery objects themselves
    // (`group_by(&:loader_query)`, batch.rb:41) and relies on
    // `LoaderQuery#hash`/`#eql?` for value equality. A JS Map keys by
    // identity, so group on the digest those two are ported as —
    // `LoaderQuery#hashKey` — and recover the query from the group.
    const groups = groupBy(nonThroughLoaders, (loader) => loader.loaderQuery().hashKey());
    for (const similarLoaders of groups.values()) {
      const query = similarLoaders[0].loaderQuery();
      await query.loadRecordsInBatch(similarLoaders);
    }
  }
}
