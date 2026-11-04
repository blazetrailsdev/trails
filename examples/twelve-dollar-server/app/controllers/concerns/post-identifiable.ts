import { Concern, extend } from "@blazetrails/activesupport";
import type { ActionController } from "@blazetrails/actionpack";

export const PostIdentifiable = {
  POST_ID: /^[1-9]\d*$/,

  async requireValidPostId(
    this: ActionController.API & {
      renderError(message: string | null, status: string): Promise<void>;
    },
    id: string,
  ): Promise<void> {
    if (!PostIdentifiable.POST_ID.test(id))
      await this.renderError("invalid post id", ":bad_request");
  },
};

extend(PostIdentifiable, Concern);
