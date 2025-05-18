import { Printer } from "./Printer.ts";
import { DeviceType } from "./deviceType.ts";
import { Cuss2 } from "../cuss2.ts";
import { EnvironmentComponent } from "cuss2-typescript-models";

export class BoardingPassPrinter extends Printer {
  constructor(component: EnvironmentComponent, cuss2: Cuss2) {
    super(component, cuss2, DeviceType.BOARDING_PASS_PRINTER);
  }

  templates: {
    clear: (id?: string) => Promise<boolean>;
    query: (id?: string) => Promise<string[]>;
  } = {
    clear: async (id = "") => {
      const response = await this.aeaCommand("TC" + id);
      return response[0] && response[0].indexOf("OK") > -1;
    },
    query: async (id = "") => {
      return await this._getPairedResponse("TA");
    },
  };
}