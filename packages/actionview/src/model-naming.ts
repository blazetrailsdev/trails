interface ModelName {
  readonly paramKey: string;
}

export function convertToModel(object: unknown): unknown {
  return typeof (object as { toModel?: unknown } | null)?.toModel === "function"
    ? (object as { toModel: () => unknown }).toModel()
    : object;
}

export function modelNameFromRecordOrClass(recordOrClass: unknown): ModelName {
  return (convertToModel(recordOrClass) as { modelName: ModelName }).modelName;
}
