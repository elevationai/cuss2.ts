import { Component } from "./Component.ts";
import { DeviceType } from "./deviceType.ts";
import { Cuss2 } from "../cuss2.ts";
import { EnvironmentComponent } from "cuss2-typescript-models";

export class AEASBD extends Component {
  constructor(component: EnvironmentComponent, cuss2: Cuss2) {
    super(component, cuss2, DeviceType.AEASBD);
  }
}
