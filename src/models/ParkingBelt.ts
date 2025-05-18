import { Component } from "./Component.ts";
import { DeviceType } from "./deviceType.ts";
import { Cuss2 } from "../cuss2.ts";
import { EnvironmentComponent } from "cuss2-typescript-models";

export class ParkingBelt extends Component {
  constructor(component: EnvironmentComponent, cuss2: Cuss2) {
    super(component, cuss2, DeviceType.PARKING_BELT);
  }
}
