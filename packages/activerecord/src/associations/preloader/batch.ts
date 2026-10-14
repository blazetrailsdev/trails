import type { Base } from "../../base.js";
import type { Preloader } from "../preloader.js";
import type { Association } from "./association.js";
import type { Branch } from "./branch.js";
import { groupBy, isEmpty, partition, uniq } from "@blazetrails/ruby-compat";
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
    const empty: boolean[] = [];
    for (const preloader of this._preloaders) empty.push(await preloader.isEmpty());
    this._preloaders = this._preloaders.filter((_, i) => !empty[i]);

    let branches: Branch[] = this._preloaders.flatMap((p) => p.branches);
    while (!isEmpty(branches)) {
      const runnableLoaders: Association[][] = [];
      for (const branch of branches) runnableLoaders.push(await branch.runnableLoaders());
      const loaders = runnableLoaders.flat();

      for (const loader of loaders) {
        loader.associateRecordsFromUnscoped(this._availableRecords.get(loader.klass.baseClass));
      }

      if (loaders.length > 0) {
        const futureClasses: (typeof Base)[][] = [];
        for (const branch of branches) {
          futureClasses.push(
            await (async () => {
              const klasses = (await branch.runnableLoaders()).map((l) => l.klass);
              return (await branch.futureClasses()).filter((k) => !klasses.includes(k));
            })(),
          );
        }
        const futureTables = uniq(futureClasses.flat().map((k) => k.tableName));

        let targetLoaders = loaders.filter((l) => !futureTables.includes(l.tableName));
        if (isEmpty(targetLoaders)) targetLoaders = loaders;

        await this.groupAndLoadSimilar(targetLoaders);
        for (const loader of targetLoaders) await loader.run();
      }

      const [finished, inProgress] = partition(branches, (branch) => branch.isDone());

      branches = inProgress.concat(finished.flatMap((branch) => branch.children));
    }
  }

  /** @internal */
  get loaders(): Association[] | undefined {
    return this._loaders;
  }

  private _loaders: Association[] | undefined;

  private async groupAndLoadSimilar(loaders: Association[]): Promise<void> {
    for (const [query, similarLoaders] of groupBy(
      loaders.filter((l) => !(l instanceof ThroughAssociation)),
      (loader) => loader.loaderQuery(),
    )) {
      await query.loadRecordsInBatch(similarLoaders);
    }
  }
}
