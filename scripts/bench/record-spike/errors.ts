export class ActiveRecordError extends Error {
  override name = "ActiveRecordError";
}

export class ConnectionNotEstablished extends ActiveRecordError {
  override name = "ConnectionNotEstablished";
}

export class RecordNotFound extends ActiveRecordError {
  override name = "RecordNotFound";
}

export class UnknownAttributeError extends ActiveRecordError {
  override name = "UnknownAttributeError";
}

export class AssociationNotFoundError extends ActiveRecordError {
  override name = "AssociationNotFoundError";
}

export class UnknownPrimaryKey extends ActiveRecordError {
  override name = "UnknownPrimaryKey";

  constructor(model: { name: string; tableName: string | null }) {
    super(`Unknown primary key for table ${String(model.tableName)} in model ${model.name}.`);
  }
}
