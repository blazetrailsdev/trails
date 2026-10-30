import type { InvocationChain } from "./invocation-chain.js";

export const InvocationExceptionMixin = {
  get chain(): InvocationChain | null {
    const self = this as { _rakeInvocationChain?: InvocationChain | null };
    return (self._rakeInvocationChain ??= null);
  },

  set chain(value: InvocationChain | null) {
    (this as { _rakeInvocationChain?: InvocationChain | null })._rakeInvocationChain = value;
  },
};
