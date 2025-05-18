import { Component } from "./Component.ts";
import { Feeder } from "./Feeder.ts";
import { Dispenser } from "./Dispenser.ts";
import { DeviceType } from "./deviceType.ts";
import { Cuss2 } from "../cuss2.ts";
import { helpers } from "../helper.ts";
import {
  ComponentState,
  CUSSDataTypes,
  DataRecord,
  DataRecordList,
  EnvironmentComponent,
  MessageCodes,
  PlatformData,
  PlatformDirectives,
} from "cuss2-typescript-models";
import { PlatformResponseError } from "./platformResponseError.ts";

export class Printer extends Component {
  constructor(
    component: EnvironmentComponent,
    cuss2: Cuss2,
    _type: DeviceType,
  ) {
    super(component, cuss2, _type);

    const missingLink = (msg: string) => {
      throw new Error(msg);
    };
    const linked = component.linkedComponentIDs?.map((id) => cuss2.components?.[id as number] as Component) || [];

    this.feeder = linked.find((c) => c instanceof Feeder) ||
      missingLink("Feeder not found for Printer " + this.id);
    this.subcomponents.push(this.feeder);

    const d = linked.find((c) => c instanceof Dispenser) as Dispenser;
    this.dispenser = d ||
      missingLink("Dispenser not found for Printer " + this.id);
    this.subcomponents.push(this.dispenser);

    // Initialize combined status and ready state
    this._combinedReady = false;
    this._combinedStatus = MessageCodes.OK;

    // Set up handlers to update combined ready state
    const updateCombinedReadyState = () => {
      const printerReady = this.ready;
      const feederReady = this.feeder.ready;
      const dispenserReady = this.dispenser.ready;

      const ready = printerReady && feederReady && dispenserReady;
      if (this._combinedReady !== ready) {
        this._combinedReady = ready;
        this.emit("combinedReadyStateChange", ready);
      }
    };

    // Set up handlers to update combined status
    const updateCombinedStatus = () => {
      const printerStatus = this.status;
      const feederStatus = this.feeder.status;
      const dispenserStatus = this.dispenser.status;

      const statuses = [printerStatus, feederStatus, dispenserStatus];
      const status = statuses.find((s) => s != MessageCodes.OK) ||
        MessageCodes.OK;

      if (this._combinedStatus !== status) {
        this._combinedStatus = status;
        this.emit("combinedStatusChange", status);
      }
    };

    // Set up listeners for status changes on all components
    this.on(
      "readyStateChange",
      updateCombinedReadyState,
    );
    this.feeder.on(
      "readyStateChange",
      updateCombinedReadyState,
    );
    this.dispenser.on(
      "readyStateChange",
      updateCombinedReadyState,
    );

    this.on("statusChange", updateCombinedStatus);
    this.feeder.on(
      "statusChange",
      updateCombinedStatus,
    );
    this.dispenser.on(
      "statusChange",
      updateCombinedStatus,
    );

    // Initial update
    updateCombinedReadyState();
    updateCombinedStatus();
  }

  feeder: Feeder;
  dispenser: Dispenser;

  _combinedReady = false;
  _combinedStatus = MessageCodes.OK;

  get mediaPresent(): boolean {
    return this.dispenser.mediaPresent;
  }

  get combinedReady(): boolean {
    return this._combinedReady;
  }

  get combinedStatus(): MessageCodes {
    return this._combinedStatus;
  }

  override updateState(msg: PlatformData): void {
    //CUTnHOLD can cause a TIMEOUT response if the tag is not taken in a certain amount of time.
    // Unfortunately, it briefly considers the Printer to be UNAVAILABLE.
    if (
      msg.meta.platformDirective === PlatformDirectives.PeripheralsSend &&
      msg.meta.messageCode === MessageCodes.TIMEOUT &&
      msg.meta.componentState === ComponentState.UNAVAILABLE
    ) {
      msg.meta.componentState = ComponentState.READY;
    }

    // if now ready, query linked components to get their latest status
    if (!this.ready && msg.meta.componentState === ComponentState.READY) {
      this.feeder.query().catch(console.error);
      this.dispenser.query().catch(console.error);
    }
    else if (msg.meta.messageCode === MessageCodes.MEDIAPRESENT) {
      // Emit mediaPresent event on the dispenser
      this.dispenser.emit("mediaPresent", true);
      // query the dispenser- which will start a poller that will detect when the media has been taken
      this.dispenser.query().catch(console.error);
    }

    // Call parent updateState to update status and emit events
    super.updateState(msg);
  }

  async setupAndPrintRaw(rawSetupData: string[], rawData?: string) {
    if (typeof rawData !== "string") {
      throw new TypeError("Invalid argument: rawData");
    }

    await this.setupRaw(rawSetupData);
    return this.printRaw(rawData);
  }

  printRaw(rawData: string) {
    return this.sendRaw(rawData)
      .catch((e: PlatformResponseError) => {
        return this.cancel().then(() => {
          throw e;
        });
      });
  }

  //TODO: Convert to sending as a batch
  async setupRaw(
    raw: string | string[],
    dsTypes: Array<CUSSDataTypes> = [CUSSDataTypes.ITPS],
  ) {
    const isArray = Array.isArray(raw);
    if (!raw || (isArray && !raw[0])) {
      return Promise.resolve(isArray ? [] : undefined);
    }
    const rawArray: string[] = isArray ? raw as string[] : [raw as string];

    const makeDataRecordList = (r: string) =>
      [{
        data: r as string,
        dsTypes: dsTypes,
      } as DataRecord] as DataRecordList;

    // Each is sent individually- but we should be able to sent them all in 1
    // ... NOTE: Sending as a group isn't possible in CUSS1
    return await Promise.all(
      rawArray.map((r) => this.api.setup(this.id, makeDataRecordList(r))),
    )
      .then((results) => isArray ? results : results[0]);
  }

  //TODO: Convert to sending as a batch
  async sendRaw(
    raw: string,
    dsTypes: Array<CUSSDataTypes> = [CUSSDataTypes.ITPS],
  ) {
    return await this.api.send(this.id, [{
      data: raw as string,
      dsTypes: dsTypes,
    } as DataRecord] as DataRecordList);
  }

  async aeaCommand(cmd: string) {
    const response = await this.setupRaw(cmd);
    if (Array.isArray(response)) {
      return response.flatMap((r) => {
        const records = (r as unknown as { dataRecords?: Array<{ data?: string }> }).dataRecords || [];
        return records.map((dr) => dr.data || "");
      });
    }
    const records = (response as unknown as { dataRecords?: Array<{ data?: string }> }).dataRecords || [];
    return records.map((r) => r.data || "");
  }

  async getEnvironment() {
    return helpers.deserializeDictionary((await this.aeaCommand("ES"))[0]);
  }

  async _getPairedResponse(cmd: string, n: number = 2) {
    const response = (await this.aeaCommand(cmd))[0];
    return helpers.split_every(
      response.substr(response.indexOf("OK") + 2),
      n,
    ) || [];
  }

  logos = {
    clear: async (id = "") => {
      const response = await this.aeaCommand("LC" + id);
      return response[0] && response[0].indexOf("OK") > -1;
    },
    query: async () => {
      return await this._getPairedResponse("LS");
    },
  };

  pectabs = {
    clear: async (id = "") => {
      const response = await this.aeaCommand("PC" + id);
      return response[0] && response[0].indexOf("OK") > -1;
    },
    query: async () => {
      return await this._getPairedResponse("PS");
    },
  };
}
