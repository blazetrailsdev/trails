/**
 * Structural shape of a model class whose validators can be cleared — the
 * port of Rails' `clear_validators!` (activemodel/lib/active_model/validations.rb).
 */
interface RepairableModel {
  clearValidatorsBang(): void;
}

/**
 * Run `fn`, then clear each model's validators afterward — even if `fn` throws.
 *
 * A 1:1 port of the block form of Rails'
 * `ActiveRecord::ValidationsRepairHelper#repair_validations`
 * (activerecord/test/cases/validations_repair_helper.rb:15-19):
 *
 *     def repair_validations(*model_classes)
 *       yield if block_given?
 *     ensure
 *       model_classes.each(&:clear_validators!)
 *     end
 *
 * Used as `repair_validations(Interest) do … end` (nested_attributes_test.rb:863)
 * to add validators inside a test body without leaking them into later tests in
 * the same file. Like Rails' `clear_validators!`, this clears *all* validators
 * on the model (resets the `validate` callbacks and empties the `_validators`
 * registry), so pass only models that should end the block validator-free.
 *
 * Rails takes `*model_classes`; this accepts a single model or an array.
 */
export async function repairValidations(
  models: RepairableModel | RepairableModel[],
  fn: () => void | Promise<void>,
): Promise<void> {
  const modelClasses = Array.isArray(models) ? models : [models];
  try {
    await fn();
  } finally {
    for (const model of modelClasses) model.clearValidatorsBang();
  }
}
