import { EventEmitter } from "events";
import { Cuss2 } from "../cuss2.ts";
import { helpers } from "../helper.ts";
import {
  ComponentState,
  CUSSDataTypes,
  DataRecord,
  EnvironmentComponent,
  MessageCodes,
  PlatformData,
  PlatformDirectives,
} from "cuss2-typescript-models";
import { DeviceType } from "./deviceType.ts";
import { PlatformResponseError } from "./platformResponseError.ts";

export class Component extends EventEmitter {
  _component: EnvironmentComponent;
  id: number;
  api: any;
  required: boolean = false;
  _status: MessageCodes = MessageCodes.OK;
  _componentState: ComponentState = ComponentState.UNAVAILABLE;
  deviceType: DeviceType;
  pendingCalls: number = 0;
  enabled: boolean = false;
  pollingInterval = 10000;
  _poller: any;
  parent: any;
  subcomponents: Component[] = [];

  get ready(): boolean {
    return this._componentState === ComponentState.READY;
  }

  get pending(): boolean {
    return this.pendingCalls > 0;
  }

  get status(): MessageCodes {
    return this._status;
  }

  constructor(
    component: EnvironmentComponent,
    cuss2: Cuss2,
    _type: DeviceType = DeviceType.UNKNOWN,
  ) {
    super();
    this._component = component;
    this.id = Number(component.componentID);
    this.deviceType = _type;
    Object.defineProperty(this, "api", {
      get: () => cuss2.api,
      enumerable: false,
    });

    // Subscribe to platform messages
    cuss2.on("message", (data: PlatformData) => {
      if (data?.meta?.componentID === this.id) {
        this._handleMessage(data);
      }
    });

    // Subscribe to deactivation events
    cuss2.on("deactivated", () => {
      this.enabled = false;
    });

    if (component.linkedComponentIDs?.length) {
      // this.constructor.name[0].toLowerCase() + this.constructor.name.substr(1) in tagging this is not working currently
      const name = this.deviceType;
      const parentId = Math.min(
        this.id,
        ...component.linkedComponentIDs as number[],
      );
      if (parentId != this.id) {
        this.parent = cuss2.components[parentId];
        // feeder and dispenser are created in the printer component
        if (this.parent && !this.parent[name]) {
          this.parent.subcomponents.push(this);
          this.parent[name] = this;
        }
      }
    }
  }

  stateIsDifferent(msg: PlatformData): boolean {
    return this.status !== msg.meta.messageCode ||
      this._componentState !== msg.meta.componentState;
  }

  override updateState(msg: PlatformData): void {
    const { meta, payload } = msg;
    if (meta.componentState !== this._componentState) {
      this._componentState = meta.componentState;
      if (meta.componentState !== ComponentState.READY) {
        this.enabled = false;
      }

      // Emit ready state change event
      this.emit(
        "readyStateChange",
        meta.componentState === ComponentState.READY,
      );
    }

    // Sometimes status is not sent by an unsolicited event so we poll to be sure
    if (
      !this.ready && this.required && !this._poller && this.pollingInterval > 0
    ) {
      this.pollUntilReady();
    }

    if (this.status !== meta.messageCode) {
      this._status = meta.messageCode;
      this.emit("statusChange", meta.messageCode);
    }
  }

  pollUntilReady(requireOK = false, pollingInterval = this.pollingInterval) {
    if (this._poller) return;
    const poll = () => {
      if (this.ready && (!requireOK || this.status === MessageCodes.OK)) {
        return this._poller = undefined;
      }

      this._poller = setTimeout(() => {
        this.query().catch(Object).finally(poll);
      }, pollingInterval);
    };
    poll();
  }

  _handleMessage(data: any) {
    this.emit("message", data);
  }

  async _call(action: Function) {
    this.pendingCalls++;
    const decrement = (r: any) => {
      this.pendingCalls--;
      return r;
    };
    return action().then(decrement).catch((e: any) => Promise.reject(decrement(e)));
  }

  enable(...args: any[]): Promise<PlatformData> {
    return this._call(() => this.api.enable(this.id))
      .then((r: any) => {
        this.enabled = true;
        return r;
      });
  }

  disable(): Promise<PlatformData> {
    return this._call(() => this.api.disable(this.id))
      .then((r: any) => {
        this.enabled = false;
        return r;
      })
      .catch((e: PlatformResponseError) => {
        if (e.messageCode === MessageCodes.OUTOFSEQUENCE) {
          this.enabled = false;
          return e;
        }
        return Promise.reject(e);
      });
  }

  cancel(): Promise<PlatformData> {
    return this._call(() => this.api.cancel(this.id));
  }

  query(): Promise<PlatformData> {
    return this._call(() => this.api.getStatus(this.id));
  }

  async setup(dataObj: any): Promise<PlatformData> {
    // {dataRecords: object[]|null = null, illuminationData: object|null = null}
    return await this.api.setup(this.id, dataObj);
  }

  async send(dataObj: any): Promise<PlatformData> {
    // {dataRecords: object[]|null = null, illuminationData: object|null = null}
    return await this.api.send(this.id, dataObj);
  }
}

export class DataReaderComponent extends Component {
  previousData: string[] = [];

  override _handleMessage(data: PlatformData) {
    this.emit("message", data);
    if (
      data?.meta?.messageCode === MessageCodes.DATAPRESENT &&
      data?.payload?.dataRecords?.length
    ) {
      this.previousData = data?.payload?.dataRecords?.map((dr: DataRecord) => dr?.data);
      this.emit("data", this.previousData);
    }
  }

  async read(ms: number = 30000) {
    return new Promise(async (resolve, reject) => {
      await this.enable();

      // Create a timeout
      const timeoutId = setTimeout(() => {
        this.off("data", dataHandler);
        reject(new Error(`Timeout of ${ms}ms exceeded`));
      }, ms);

      // Set up a one-time data handler
      const dataHandler = (data: string[]) => {
        clearTimeout(timeoutId);
        resolve(data);
      };

      this.once("data", dataHandler);
    })
      .finally(() => this.disable());
  }
}

export class BarcodeReader extends DataReaderComponent {
  constructor(component: EnvironmentComponent, cuss2: Cuss2) {
    super(component, cuss2, DeviceType.BARCODE_READER);
  }
}

export class DocumentReader extends DataReaderComponent {
  constructor(component: EnvironmentComponent, cuss2: Cuss2) {
    super(component, cuss2, DeviceType.PASSPORT_READER);
  }
}

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

export class Scale extends DataReaderComponent {
  constructor(component: EnvironmentComponent, cuss2: Cuss2) {
    super(component, cuss2, DeviceType.SCALE);
  }
}

export class RFID extends DataReaderComponent {
  constructor(component: EnvironmentComponent, cuss2: Cuss2) {
    super(component, cuss2, DeviceType.RFID);
  }
}

export class Camera extends DataReaderComponent {
  constructor(component: EnvironmentComponent, cuss2: Cuss2) {
    super(component, cuss2, DeviceType.CAMERA);
  }
}

export class AEASBD extends Component {
  constructor(component: EnvironmentComponent, cuss2: Cuss2) {
    super(component, cuss2, DeviceType.AEASBD);
  }

  // send AEA command to query sbd

  // Listen for unsolicited events for baggage status

  // transform them to cuss2 SBD models
}

export class BHS extends DataReaderComponent {
  constructor(component: EnvironmentComponent, cuss2: Cuss2) {
    super(component, cuss2, DeviceType.CAMERA);
  }
}

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
    const linked = component.linkedComponentIDs?.map((id) => cuss2.components[id as number] as Component) || [];

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
    } else if (msg.meta.messageCode === MessageCodes.MEDIAPRESENT) {
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

  async printRaw(rawData: string) {
    return this.sendRaw(rawData)
      .catch((e: PlatformResponseError) => {
        return this.cancel().then(() => {
          throw e;
        });
      });
  }

  async setupRaw(
    raw: string | string[],
    dsTypes: Array<CUSSDataTypes> = [CUSSDataTypes.ITPS],
  ) {
    const isArray = Array.isArray(raw);
    if (!raw || (isArray && !raw[0])) {
      return Promise.resolve(isArray ? [] : undefined);
    }
    const rawArray: string[] = isArray ? raw as string[] : [raw as string];

    const dx = (r: string) => [{
      data: r as any,
      dsTypes: dsTypes,
    }];

    return await Promise.all(
      rawArray.map((r) => this.api.setup(this.id, dx(r))),
    )
      .then((results) => isArray ? results : results[0]);
  }

  async sendRaw(
    raw: string,
    dsTypes: Array<CUSSDataTypes> = [CUSSDataTypes.ITPS],
  ) {
    const dataRecords = [{
      data: raw as any,
      dsTypes: dsTypes,
    }];
    return this.api.send(this.id, dataRecords);
  }

  async aeaCommand(cmd: string) {
    const response = await this.setupRaw(cmd);
    return (response.dataRecords || []).map((r: any) => r.data || "");
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

  logos: any = {
    clear: async (id = "") => {
      const response = await this.aeaCommand("LC" + id);
      return response[0] && response[0].indexOf("OK") > -1;
    },
    query: async (id = "") => {
      return this._getPairedResponse("LS");
    },
  };

  pectabs: any = {
    clear: async (id = "") => {
      const response = await this.aeaCommand("PC" + id);
      return response[0] && response[0].indexOf("OK") > -1;
    },
    query: async () => {
      return this._getPairedResponse("PS");
    },
  };
}

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

export class Feeder extends Component {
  printer?: Printer;
  constructor(component: EnvironmentComponent, cuss2: Cuss2) {
    super(component, cuss2, DeviceType.FEEDER);
  }
}

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
      } else {
        if (this._mediaPresent) {
          this._mediaPresent = false;
          this.emit("mediaPresent", false);
        }
      }
    });
  }
}

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

export class Announcement extends Component {
  say(text: string, lang: string = "en-US") {
    const xml =
      `<?xml version="1.0" encoding="UTF-8"?><speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${lang}">${text}</speak>`;
    return this.play(xml);
  }
  play(xml: string) {
    return this.api.announcement.play(this.id, xml);
  }

  stop() {
    return this.api.announcement.stop(this.id);
  }

  pause() {
    return this.api.announcement.pause(this.id);
  }

  resume() {
    return this.api.announcement.resume(this.id);
  }
}

export class Illumination extends Component {
  constructor(component: EnvironmentComponent, cuss2: Cuss2) {
    super(component, cuss2, DeviceType.ILLUMINATION);
  }

  override async enable(
    duration: number,
    color?: string | number[],
    blink?: number[],
  ) {
    const name = (typeof color === "string")
      ? CUSS2IlluminationdomainIlluminationDataLightColor.NameEnum[color]
      : undefined;
    const rgb = (Array.isArray(color) && color.length === 3)
      ? { red: color[0], green: color[1], blue: color[2] }
      : undefined;
    const blinkRate = (Array.isArray(blink) && blink.length === 2)
      ? { durationOn: blink[0], durationOff: blink[1] }
      : undefined;

    if (this.enabled) {
      await this.disable();
    }
    await super.enable();
    return await this.send({
      illuminationData: { duration, lightColor: { name, rgb }, blinkRate },
    });
  }
}

export class Headset extends Component {
  constructor(component: EnvironmentComponent, cuss2: Cuss2) {
    super(component, cuss2, DeviceType.HEADSET);
  }
}

export class Biometric extends Component {
  constructor(component: EnvironmentComponent, cuss2: Cuss2) {
    super(component, cuss2, DeviceType.BIOMETRIC);
  }
}

export class InsertionBelt extends Component {
  constructor(component: EnvironmentComponent, cuss2: Cuss2) {
    super(component, cuss2, DeviceType.INSERTION_BELT);
  }
}

export class VerificationBelt extends Component {
  constructor(component: EnvironmentComponent, cuss2: Cuss2) {
    super(component, cuss2, DeviceType.VERIFICATION_BELT);
  }
}

export class ParkingBelt extends Component {
  constructor(component: EnvironmentComponent, cuss2: Cuss2) {
    super(component, cuss2, DeviceType.PARKING_BELT);
  }
}
