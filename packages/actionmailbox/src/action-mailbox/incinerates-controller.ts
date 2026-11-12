import { Trails } from "@blazetrails/trailties";
import { ActionMailbox } from "../action-mailbox.js";
import "../base-controller.js";

export class IncineratesController extends Trails.Conductor.BaseController {
  async create(): Promise<void> {
    await (await ActionMailbox.InboundEmail.find(this.params.get("inbound_email_id"))).incinerate();

    this.redirectTo(this.mainApp.trailsConductorInboundEmailsUrl());
  }
}

Trails.Conductor.ActionMailbox.IncineratesController = IncineratesController;
