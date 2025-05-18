import { Component } from "./component.ts";
import { DeviceType } from "./deviceType.ts";
import { Cuss2 } from "../cuss2.ts";
import { EnvironmentComponent, MessageCodes } from "cuss2-typescript-models";
import { Printer } from "./Printer.ts";

export class Dispenser extends Component {
  printer?: Printer;
  private _mediaPresent: boolean = false;

  get mediaPresent(): boolean {
    return this._mediaPresent;
  }

  constructor(component: EnvironmentComponent, cuss2: Cuss2) {
    super(component, cuss2, DeviceType.DISPENSER);

    // Listen for status changes
    this.on("statusChange", (status: MessageCodes) => {
      if (status === MessageCodes.MEDIAPRESENT) {
        this.pollUntilReady(true, 2000);
        if (!this._mediaPresent) {
          this._mediaPresent = true;
          this.emit("mediaPresent", true);
        }
      }
      else {
        if (this._mediaPresent) {
          this._mediaPresent = false;
          this.emit("mediaPresent", false);
        }
      }
    });
  }
}
