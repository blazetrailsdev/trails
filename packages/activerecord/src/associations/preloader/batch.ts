import type { Base } from "../../base.js";
import type { Preloader } from "../preloader.js";
import type { Association } from "./association.js";
import type { Branch } from "./branch.js";
import { groupBy } from "@blazetrails/activesupport";
import { ThroughAssociation } from "./through-association.js";

export class Batch {
  private _preloaders: Preloader[];
  private _availableRecords: Map<typeof Base, Base[]>;

  constructor(preloaders: Preloader[], availableRecords: (Base | Base[])[] = []) {
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
      try {
        const association = (record as any).association(branch.association);
        if (!association.isLoaded()) {
          association._setTargetFromLoader(null);
        }
      } catch {}
    }
  }

  private async groupAndLoadSimilar(loaders: Association[]): Promise<void> {
    const nonThroughLoaders = loaders.filter((l) => !(l instanceof ThroughAssociation));
    const groups = groupBy(nonThroughLoaders, (loader) => loader.loaderQuery().hashKey());
    for (const similarLoaders of groups.values()) {
      const query = similarLoaders[0].loaderQuery();
      await query.loadRecordsInBatch(similarLoaders);
    }
  }
}
