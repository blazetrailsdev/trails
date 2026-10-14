import { Digest } from "@blazetrails/activesupport/digest";
import { expandCacheKey } from "@blazetrails/activesupport/cache";

export const EtagHelper = {
  weakEtag(record: unknown): string {
    return `W/${EtagHelper.strongEtag(record)}`;
  },

  strongEtag(record: unknown): string {
    return `"${Digest.hexdigest(expandCacheKey(record))}"`;
  },
};
