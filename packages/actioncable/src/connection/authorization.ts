import { StandardError, defineModule, rbModConstSet } from "@blazetrails/ruby-compat";
import { Connection } from "../namespaces.js";

class UnauthorizedError extends StandardError {}

interface AuthorizationConnection {
  logger: { error(message: string): unknown };
}

function rejectUnauthorizedConnection(this: AuthorizationConnection): never {
  this.logger.error("An unauthorized connection attempt was rejected");
  throw new UnauthorizedError();
}

export const Authorization = defineModule({ rejectUnauthorizedConnection }) as {
  rejectUnauthorizedConnection: typeof rejectUnauthorizedConnection;
  UnauthorizedError: typeof UnauthorizedError;
};
rbModConstSet(Authorization, "UnauthorizedError", UnauthorizedError);

rbModConstSet(Connection, "Authorization", Authorization);
