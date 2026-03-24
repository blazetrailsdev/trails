export class ArelError extends Error {
  constructor(message?: string) {
    super(message);
    this.name = "ArelError";
  }
}

export class EmptyJoinError extends ArelError {
  constructor(message?: string) {
    super(message);
    this.name = "EmptyJoinError";
  }
}

export class BindError extends ArelError {
  constructor(message: string, sql?: string) {
    super(sql ? `${message} in: ${JSON.stringify(sql)}` : message);
    this.name = "BindError";
  }
}
