import { Printer } from "./Printer.ts";
import { DeviceType } from "./deviceType.ts";
import { Cuss2 } from "../cuss2.ts";
import { EnvironmentComponent } from "cuss2-typescript-models";

export class BagTagPrinter extends Printer {
  constructor(component: EnvironmentComponent, cuss2: Cuss2) {
    super(component, cuss2, DeviceType.BAG_TAG_PRINTER);
  }

  override pectabs: {
    clear: (id?: string) => Promise<boolean>;
    query: () => Promise<string[]>;
  } = {
    clear: async (id = "") => {
      const response = await this.aeaCommand("PC" + id);
      return response[0] && response[0].indexOf("OK") > -1;
    },
    query: async () => {
      return await this._getPairedResponse("PS", 4);
    },
  };
}
