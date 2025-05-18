import { Component } from "./component.ts";
import { DeviceType } from "./deviceType.ts";
import { Cuss2 } from "../cuss2.ts";
import { EnvironmentComponent } from "cuss2-typescript-models";

export class AEASBD extends Component {
  constructor(component: EnvironmentComponent, cuss2: Cuss2) {
    super(component, cuss2, DeviceType.AEASBD);
  }

  // send AEA command to query sbd

  // Listen for unsolicited events for baggage status

  // transform them to cuss2 SBD models
}