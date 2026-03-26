/**
 * Groups preloader branches into batches that can be loaded together.
 *
 * Mirrors: ActiveRecord::Associations::Preloader::Batch
 */
export class Batch {
  readonly branches: any[];

  constructor(branches: any[] = []) {
    this.branches = branches;
  }

  async call(): Promise<void> {
    for (const branch of this.branches) {
      await branch.runnable_loaders?.();
    }
  }
}
