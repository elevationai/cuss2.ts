import { DataReaderComponent } from "./DataReaderComponent.ts";
import { DeviceType } from "./deviceType.ts";
import { Cuss2 } from "../cuss2.ts";
import { EnvironmentComponent, CUSSDataTypes } from "cuss2-typescript-models";

export class CardReader extends DataReaderComponent {
  constructor(component: EnvironmentComponent, cuss2: Cuss2) {
    super(component, cuss2, DeviceType.MSR_READER);
  }

  async enablePayment(yes: boolean) {
    await this.setup([{
      data: "",
      dsTypes: [
        yes ? "DS_TYPES_PAYMENT_ISO" as CUSSDataTypes : CUSSDataTypes.FOIDISO,
      ],
    }]);
  }

  async readPayment(ms: number = 30000) {
    await this.enablePayment(true);
    await this.read(ms);
    await this.enablePayment(false);
  }
}