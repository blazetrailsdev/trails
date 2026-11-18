import { PG } from "./namespaces.js";

/** @noRailsEquivalent PERMANENT */
export const Constants = {
  CONNECTION_OK: 0,
  CONNECTION_BAD: 1,
  PQTRANS_IDLE: 0,
  PQTRANS_ACTIVE: 1,
  PQTRANS_INTRANS: 2,
  PQTRANS_INERROR: 3,
  PG_DIAG_SEVERITY: 83,
  PG_DIAG_SQLSTATE: 67,
  PG_DIAG_MESSAGE_PRIMARY: 77,
  PG_DIAG_SOURCE_FUNCTION: 82,
};

PG.Constants = Constants;
Object.assign(PG, Constants);
