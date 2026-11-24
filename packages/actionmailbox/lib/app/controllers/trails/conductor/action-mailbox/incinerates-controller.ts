import { Trails } from "@blazetrails/trailties";
import { constGet, constSet } from "@blazetrails/ruby-compat";
import { ActionMailbox } from "../../../../../action-mailbox.js";
import "../../../action-mailbox/base-controller.js";

export class IncineratesController extends Trails.Conductor.BaseController {
  async create(): Promise<void> {
    await (await ActionMailbox.InboundEmail.find(this.params.get("inbound_email_id"))).incinerate();

    await this.redirectTo(this.mainApp.trailsConductorInboundEmailsUrl());
  }
}

constSet(
  constGet(Trails, "Conductor::ActionMailbox") as object,
  "IncineratesController",
  IncineratesController,
);
