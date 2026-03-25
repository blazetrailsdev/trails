/**
 * Raised by bang persistence methods (save!, create!) when the record is invalid.
 *
 * Mirrors: ActiveRecord::RecordInvalid
 */
export class RecordInvalid extends Error {
  readonly record: any;

  constructor(record: any) {
    const fullMessages = record.errors?.fullMessages;
    const message =
      Array.isArray(fullMessages) && fullMessages.length > 0
        ? `Validation failed: ${fullMessages.join(", ")}`
        : "Validation failed";
    super(message);
    this.name = "RecordInvalid";
    this.record = record;
  }
}
