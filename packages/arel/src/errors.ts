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
    super(sql ? `${message} in: ${sql}` : message);
    this.name = "BindError";
  }
}

/**
 * Thrown when no visit method is registered for a node's runtime class
 * (after walking the prototype chain).
 *
 * Rails raises a plain `TypeError("Cannot visit #{class}")` from
 * `Arel::Visitors::Visitor#visit` (`activerecord/lib/arel/visitors/visitor.rb`).
 * Trails throws this named subclass of `ArelError` instead — same
 * condition, but a named error class is more idiomatic in TS (callers
 * catch by `instanceof`), and `Visitors.UnsupportedVisitError` was already
 * the public surface before the dispatch refactor. Pinned by
 * `to-sql.test.ts` "unsupported input should raise UnsupportedVisitError".
 */
export class UnsupportedVisitError extends ArelError {
  constructor(message: string) {
    super(message);
    this.name = "UnsupportedVisitError";
  }
}

export class NotImplementedError extends ArelError {
  constructor(message: string) {
    super(message);
    this.name = "NotImplementedError";
  }
}
