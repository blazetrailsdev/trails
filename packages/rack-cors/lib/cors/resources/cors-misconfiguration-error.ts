import { StandardError } from "@blazetrails/ruby-compat";

export class CorsMisconfigurationError extends StandardError {
  override get message(): string {
    return (
      "Allowing credentials for wildcard origins is insecure." +
      " Please specify more restrictive origins or set 'credentials' to false in your CORS configuration."
    );
  }
}
