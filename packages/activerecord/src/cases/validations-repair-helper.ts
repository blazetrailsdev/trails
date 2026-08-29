interface RepairableModel {
  clearValidatorsBang(): void;
}

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
