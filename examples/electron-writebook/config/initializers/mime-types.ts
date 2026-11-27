import { MimeType } from "@blazetrails/actionpack";

// Rails registers text/markdown from 8.1 (action_dispatch/http/mime_types.rb);
// Writebook's books#show answers it.
MimeType.register("text/markdown", ":md", [], ["md", "markdown"]);
