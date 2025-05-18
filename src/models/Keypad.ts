import { Component } from "./Component.ts";
import { DeviceType } from "./deviceType.ts";
import { Cuss2 } from "../cuss2.ts";
import { EnvironmentComponent, PlatformData } from "cuss2-typescript-models";

export class Keypad extends Component {
  constructor(component: EnvironmentComponent, cuss2: Cuss2) {
    super(component, cuss2, DeviceType.KEY_PAD);
  }

  override _handleMessage(message: PlatformData) {
    super._handleMessage(message);
    if (message.meta.componentID !== this.id) return;

    const dataRecords = message.payload?.dataRecords;
    if (dataRecords?.length) {
      const data = dataRecords.map((dr) => dr.data);
      const keypadData = {
        UP: data.includes("NAVUP"),
        DOWN: data.includes("NAVDOWN"),
        PREVIOUS: data.includes("NAVPREVIOUS"),
        NEXT: data.includes("NAVNEXT"),
        ENTER: data.includes("NAVENTER"),
        HOME: data.includes("NAVHOME"),
        END: data.includes("NAVEND"),
        HELP: data.includes("NAVHELP"),
        VOLUMEUP: data.includes("VOLUMEUP"),
        VOLUMEDOWN: data.includes("VOLUMEDOWN"),
      };

      // Emit keypadData event
      this.emit("keypadData", keypadData);
    }
  }
}
