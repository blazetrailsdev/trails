import type { Mapper, RouteSet } from "@blazetrails/actionpack";
import { TopLevel } from "@blazetrails/activesupport";

(TopLevel.Trails!.application!.routes() as unknown as RouteSet).draw(function (this: Mapper) {
  this.resources("articles", function (this: Mapper) {
    this.delete("destroy_all", { on: "collection" });
  });
  this.resources("messages", function (this: Mapper) {
    this.collection(function (this: Mapper) {
      this.get("section");
    });
  });
  this.resources("trays");
  this.resources("posts");
  this.resources("notifications");
  this.namespace("users", function (this: Mapper) {
    this.resources("profiles");
  });
  this.namespace("admin", function (this: Mapper) {
    this.resources("companies");
  });
  this.resource("request_id");
});
