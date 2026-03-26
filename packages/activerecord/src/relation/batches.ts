/**
 * Batch processing methods: findEach, findInBatches, inBatches.
 *
 * Mirrors: ActiveRecord::Batches
 */
export class Batches {
  static readonly ORDER_IGNORE_MESSAGE =
    "Scoped order is ignored, it's forced to be batch order." as const;

  static readonly DEFAULT_BATCH_SIZE = 1000;
}
