import { StandardError, defineModule } from "@blazetrails/ruby-compat";

export class UnauthorizedError extends StandardError {}

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
Authorization.UnauthorizedError = UnauthorizedError;
