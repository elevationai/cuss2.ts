import { EventEmitter } from "node:events";
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

/**
 * @class General object representing a CUSS component with methods and properties to interact with it.
 * @param {EnvironmentComponent} component
 * @param {Cuss2} cuss2
 * @param {DeviceType} _type
 * @property {number} id - Numeric ID assigned to the component; used for identification of a specific component.
 * @property {boolean} required - Whether the component is required to be connected to the CUSS Platform.
 * @property {DeviceType} deviceType - The type of device the component is, *See IATA documentation for more details.
 * @property {number} pendingCalls - The number of pending calls to the component.
 * @property {boolean} enabled - Whether the component is enabled or not.
 * @property {number} pollingInterval - The interval in milliseconds to poll the component for data.
 * @property {any} parent - The parent of the component.
 * @property {Component[]} subcomponents - The subcomponents of the component.
 * @example
 * // id is the numeric ID assigned to the component
 * this.id = id;
 * @example
 * // Listen for messages from the component
 * this.on('message', data => {
 * 	console.log(data);
 * });
 * @example
 * // required is whether the component is required to be connected to the CUSS Platform
 * this.required = true;
 * @example
 * // deviceType is the type of device the component is, *See IATA documentation for more details.
 * this.deviceType = DeviceType;
 * @example
 * // pendingCalls is the number of pending calls to the component
 * this.pendingCalls = 0;
 * @example
 * // enabled is whether the component is enabled or not
 * this.enabled
 * @example
 * // pollingInterval is the interval in milliseconds to poll the component
 * this.pollingInterval = 1000;
 * @example
 * // parent is the parent of the component
 * this.parent = parent;
 * @example
 * // subcomponents are an array subcomponents to the component
 * this.subcomponents = subcomponents;
 */
// Create a type that includes both Component and EventEmitter methods
export type ComponentWithEvents = Component & EventEmitter;

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

  /**
   * @typeof Getter
   * @returns {boolean} true if the component is ready
   */
  get ready(): boolean {
    return this._componentState === ComponentState.READY;
  }

  /**
   * @typeof Getter
   * @returns {boolean} true if there are pending calls to the component
   */
  get pending(): boolean {
    return this.pendingCalls > 0;
  }

  /**
   * @typeof Getter
   * @returns {MessageCodes} the status of the component
   */
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
    cuss2._stateChangeEmitter.on("message", (data: PlatformData) => {
      if (data?.meta?.componentID === this.id) {
        this._handleMessage(data);
      }
    });

    // Subscribe to deactivation events
    cuss2._stateChangeEmitter.on("deactivated", () => {
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
    // Cast to ComponentWithEvents to access EventEmitter methods
    (this as ComponentWithEvents).emit("message", data);
  }

  async _call(action: Function) {
    this.pendingCalls++;
    const decrement = (r: any) => {
      this.pendingCalls--;
      return r;
    };
    return action().then(decrement).catch((e: any) =>
      Promise.reject(decrement(e))
    );
  }

  /**
   * Enable the component.
   * @param {any} args
   * @returns {Promise<PlatformData>} - The response from the platform.
   * @example
   * // Enable the component
   * Component.enable();
   */
  enable(...args: any[]): Promise<PlatformData> {
    return this._call(() => this.api.enable(this.id))
      .then((r: any) => {
        this.enabled = true;
        return r;
      });
  }

  /**
   * Disable the component.
   * @returns {Promise<PlatformData>} - The response from the platform.
   * @example
   * // Disable the component
   * Component.disable();
   */
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

  /**
   * Call to cancel the component.
   * @returns {Promise<PlatformData>} - The response from the platform.
   * @example
   * // Cancel the component
   * Component.cancel();
   */
  cancel(): Promise<PlatformData> {
    return this._call(() => this.api.cancel(this.id));
  }

  /**
   * Gives the status of the component.
   * @returns {Promise<PlatformData>} - The response from the platform.
   * @example
   * // Get the status of the component
   * Component.query();
   */
  query(): Promise<PlatformData> {
    return this._call(() => this.api.getStatus(this.id));
  }

  /**
   * Sends set up data which depends on the type of the component.
   * @param {any} dataObj - *Note* see IATA standard for details on the format of the data.
   * @returns {Promise<PlatformData>} - The response from the platform.
   * @example
   * // Send set up data to the component
   * Component.setup(applicationData);
   */
  async setup(dataObj: any): Promise<PlatformData> {
    // {dataRecords: object[]|null = null, illuminationData: object|null = null}
    return await this.api.setup(this.id, dataObj);
  }

  /**
   * A generic way to communicate with the component from the application.
   * @param {any} dataObj - *Note* see IATA standard for details on the format of the data.
   * @returns {Promise<PlatformData>} - The response from the platform.
   * @example
   * // Send data to the component
   * Component.send(applicationData);
   */
  async send(dataObj: any): Promise<PlatformData> {
    // {dataRecords: object[]|null = null, illuminationData: object|null = null}
    return await this.api.send(this.id, dataObj);
  }
}

/**
 * @class A component that reads data from the platform
 * @extends Component
 * @property {string[]} previousData - the previous data records
 * @example
 * // Listen for data events
 * DataReaderComponent.on('data', data => {
 * 	console.log(data);
 * });
 * @example
 * // access previous data records
 * console.log(DataReaderComponent.previousData);
 */
export class DataReaderComponent extends Component {
  previousData: string[] = [];

  override _handleMessage(data: PlatformData) {
    this.emit("message", data);
    if (
      data?.meta?.messageCode === MessageCodes.DATAPRESENT &&
      data?.payload?.dataRecords?.length
    ) {
      this.previousData = data?.payload?.dataRecords?.map((dr: DataRecord) =>
        dr?.data
      );
      this.emit("data", this.previousData);
    }
  }

  /**
   * Will enable the component and start reading data and after the timeout will disable the component.
   * @param {number} ms - timeout in milliseconds
   * @example
   * // Enable the component and start reading data
   * DataReaderComponent.read(5000);
   */
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

/**
 * @class A component that reads barcodes from the platform.
 * @extends DataReaderComponent
 * @param {EnvironmentComponent} component
 * @param {Cuss2} cuss2
 */
export class BarcodeReader extends DataReaderComponent {
  constructor(component: EnvironmentComponent, cuss2: Cuss2) {
    super(component, cuss2, DeviceType.BARCODE_READER);
  }
}

/**
 * @class A component that reads documents from the platform.
 * @extends DataReaderComponent
 * @param {EnvironmentComponent} component
 * @param {Cuss2} cuss2
 */
export class DocumentReader extends DataReaderComponent {
  constructor(component: EnvironmentComponent, cuss2: Cuss2) {
    super(component, cuss2, DeviceType.PASSPORT_READER);
  }
}

/**
 * @class A component that reads data from the platform.
 * @extends DataReaderComponent
 * @param {EnvironmentComponent} component
 * @param {Cuss2} cuss2
 */
export class CardReader extends DataReaderComponent {
  constructor(component: EnvironmentComponent, cuss2: Cuss2) {
    super(component, cuss2, DeviceType.MSR_READER);
  }
  /**
   * Call set up to enable payment mode or form of identification.
   * @param {boolean} yes true is payment mode, false is form of identification
   * @example
   * // Enable payment mode
   * CardReader.enablePayment(true);
   */
  async enablePayment(yes: boolean) {
    await this.setup([{
      data: "",
      dsTypes: [
        yes ? "DS_TYPES_PAYMENT_ISO" as CUSSDataTypes : CUSSDataTypes.FOIDISO,
      ],
    }]);
  }

  /**
   * read the card data for payment
   * @param {number} ms - timeout in milliseconds of how long it will read for.
   * @example
   * // read the card data for payment
   * CardReader.readPayment(5000);
   */
  async readPayment(ms: number = 30000) {
    await this.enablePayment(true);
    await this.read(ms);
    await this.enablePayment(false);
  }
}

/**
 * @class A component that provides weight input
 * @param {EnvironmentComponent} component
 * @param {Cuss2} cuss2
 */
export class Scale extends DataReaderComponent {
  constructor(component: EnvironmentComponent, cuss2: Cuss2) {
    super(component, cuss2, DeviceType.SCALE);
  }
}

/**
 * @class A component that provides data input
 * @param {EnvironmentComponent} component
 * @param {Cuss2} cuss2
 */
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

/**
 * @class A component that prints.
 * @extends Component
 * @param {EnvironmentComponent} component
 * @param {Cuss2} cuss2
 * @param {DeviceType} _type
 * @property {Feeder} feeder - The feeder component linked this printer.
 * @property {Dispenser} dispenser - The dispenser component linked this printer.

 * @example
 * //feeder
 * Printer.feeder // The linked feeder component
 * @example
 * //dispenser
 * Printer.dispenser // The linked dispenser component
 */
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
    const linked =
      component.linkedComponentIDs?.map((id) =>
        cuss2.components[id as number] as Component
      ) || [];

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

    // Set up listeners for status changes on all components - cast to ComponentWithEvents to access EventEmitter methods
    (this as ComponentWithEvents).on(
      "readyStateChange",
      updateCombinedReadyState,
    );
    (this.feeder as ComponentWithEvents).on(
      "readyStateChange",
      updateCombinedReadyState,
    );
    (this.dispenser as ComponentWithEvents).on(
      "readyStateChange",
      updateCombinedReadyState,
    );

    (this as ComponentWithEvents).on("statusChange", updateCombinedStatus);
    (this.feeder as ComponentWithEvents).on(
      "statusChange",
      updateCombinedStatus,
    );
    (this.dispenser as ComponentWithEvents).on(
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

  /**
   * @typeof - Getter
   * @returns {boolean} - The current media present state.
   */
  get mediaPresent(): boolean {
    return this.dispenser.mediaPresent;
  }

  /**
   * @typeof - Getter
   * @returns {boolean} - The combined ready state of the printer, feeder, and dispenser
   */
  get combinedReady(): boolean {
    return this._combinedReady;
  }

  /**
   * @typeof - Getter
   * @returns {MessageCodes} - The combined status of the printer, feeder, and dispenser.
   */
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
      // Cast dispenser to ComponentWithEvents to access EventEmitter methods
      (this.dispenser as ComponentWithEvents).emit("mediaPresent", true);
      // query the dispenser- which will start a poller that will detect when the media has been taken
      this.dispenser.query().catch(console.error);
    }

    // Call parent updateState to update status and emit events
    super.updateState(msg);
  }

  /**
   * Combined call to set up the printer and then print.
   * @param {string[]} rawSetupData - The setup data to send to the printer.
   * @param {string} rawData - The data to print.
   * @returns {Promise<PlatformData>} - The response from the platform after the print command.
   * @example
   * //set up and print
   * await Printer.setupAndPrintRaw(['string1','string2'], 'string3')
   */
  async setupAndPrintRaw(rawSetupData: string[], rawData?: string) {
    if (typeof rawData !== "string") {
      throw new TypeError("Invalid argument: rawData");
    }

    await this.setupRaw(rawSetupData);
    return this.printRaw(rawData);
  }

  /**
   * Sends a print command to the printer.
   * @param {string} rawData - The data to print.
   * @returns {Promise<PlatformData>} - The response from the platform.
   * @example
   * //print
   * await Printer.printRaw('string')
   */
  async printRaw(rawData: string) {
    return this.sendRaw(rawData)
      .catch((e: PlatformResponseError) => {
        return this.cancel().then(() => {
          throw e;
        });
      });
  }

  /**
   * Sends a setup command to the printer.
   * @param {string | string[]}raw - The setup data to send to the printer.
   * @param { Array<CUSSDataTypes>} dsTypes - The data types of the setup data. *OptionalParam*
   * @returns {Promise<PlatformData>} - The response from the platform.
   * @example
   * //setup
   * await Printer.setupRaw('string')
   */
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

  /**
   * Gets environment data from the printer.
   * @returns dataRecords from the PlatformData response.
   * @example
   * //get environment data
   * Printer.getEnvironmentData()
   */
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

/**
 * @class A printer that can print bag tags.
 * @extends Printer
 * @param {EnvironmentComponent} component
 * @param {Cuss2} cuss2
 */
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

/**
 * @class A printer that can print boarding passes.
 * @extends Printer
 * @param {EnvironmentComponent} component
 * @param {Cuss2} cuss2
 */
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

/**
 * @class A part of a printer that feeds paper.
 * @extends Component
 * @param {EnvironmentComponent} component
 * @param {Cuss2} cuss2
 * @property {Printer} printer - The printer that this feeder is attached to.
 * @example
 * //get the printer that this feeder is attached to
 * Feeder.printer
 */
export class Feeder extends Component {
  printer?: Printer;
  constructor(component: EnvironmentComponent, cuss2: Cuss2) {
    super(component, cuss2, DeviceType.FEEDER);
  }
}

/**
 * @class A part of a printer that dispenses printed media.
 * @extends Component
 * @param {EnvironmentComponent} component
 * @param {Cuss2} cuss2
 * @property {Printer} printer - The printer that this dispenser is attached to.
 * @example
 * //get the printer that this dispenser is attached to
 * Dispenser.printer
 */
export class Dispenser extends Component {
  printer?: Printer;
  private _mediaPresent: boolean = false;

  /**
   * @typeof Getter
   * @returns {boolean} - Whether or not media is present in the dispenser.
   */
  get mediaPresent(): boolean {
    return this._mediaPresent;
  }

  constructor(component: EnvironmentComponent, cuss2: Cuss2) {
    super(component, cuss2, DeviceType.DISPENSER);

    // Cast to ComponentWithEvents to access EventEmitter methods
    (this as ComponentWithEvents).on("statusChange", (status: MessageCodes) => {
      if (status === MessageCodes.MEDIAPRESENT) {
        this.pollUntilReady(true, 2000);
        if (!this._mediaPresent) {
          this._mediaPresent = true;
          (this as ComponentWithEvents).emit("mediaPresent", true);
        }
      } else {
        if (this._mediaPresent) {
          this._mediaPresent = false;
          (this as ComponentWithEvents).emit("mediaPresent", false);
        }
      }
    });
  }
}

/**
 * @class A component that provides keypad input.
 * @extends Component
 * @param {EnvironmentComponent} component
 * @param {Cuss2} cuss2
 */
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

      // Cast to ComponentWithEvents to access EventEmitter methods
      (this as ComponentWithEvents).emit("keypadData", keypadData);
    }
  }
}

/**
 * @class A component that announces messages.
 * @extends Component
 */
export class Announcement extends Component {
  /**
   * Say the announcement.
   * @param {string} text - The text to say.
   * @param {string} lang - The language used to say the text.
   * @returns {Promise<PlatformData>} - The response from the platform.
   * @example
   * Announcement.say("something to say", "en-US");
   */
  say(text: string, lang: string = "en-US") {
    const xml =
      `<?xml version="1.0" encoding="UTF-8"?><speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${lang}">${text}</speak>`;
    return this.play(xml);
  }
  play(xml: string) {
    return this.api.announcement.play(this.id, xml);
  }
  /**
   * Stop the announcement.
   * @returns {Promise<PlatformData>} - The response from the platform.
   * @example
   * Announcement.stop();
   */
  stop() {
    return this.api.announcement.stop(this.id);
  }
  /**
   * Pause the announcement.
   * @returns {Promise<PlatformData>} - The response from the platform.
   * @example
   * Announcement.pause();
   */
  pause() {
    return this.api.announcement.pause(this.id);
  }
  /**
   * Resume the announcement.
   * @returns {Promise<PlatformData>} - The response from the platform.
   * @example
   * Announcement.resume();
   */
  resume() {
    return this.api.announcement.resume(this.id);
  }
}

/**
 * @class A component that controls illumination.
 * @extends Component
 * @param {EnvironmentComponent} component
 * @param {Cuss2} cuss2
 */
export class Illumination extends Component {
  constructor(component: EnvironmentComponent, cuss2: Cuss2) {
    super(component, cuss2, DeviceType.ILLUMINATION);
  }
  /**
   * Enable the illumination.
   * @param {number} duration - The duration of the illumination in milliseconds.
   * @param {string | number[]} color - The color of the illumination.
   * @param {number[]} blink - How many times to blink
   * @returns {Promise<PlatformData>} - The response from the platform.
   * @example
   * //enable the illumination
   * Illumination.enable(1000, '#FF0000', [1, 2]);
   */
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

/**
 * @class A component that provides audio feedback.
 * @param {EnvironmentComponent} component
 * @param {Cuss2} cuss2
 */
export class Headset extends Component {
  constructor(component: EnvironmentComponent, cuss2: Cuss2) {
    super(component, cuss2, DeviceType.HEADSET);
  }
}

/**
 * @class A component that provides biometrics.
 * @param {EnvironmentComponent} component
 * @param {Cuss2} cuss2
 */
export class Biometric extends Component {
  constructor(component: EnvironmentComponent, cuss2: Cuss2) {
    super(component, cuss2, DeviceType.BIOMETRIC);
  }
}

/**
 * @class A component that provides audio feedback.
 * @param {EnvironmentComponent} component
 * @param {Cuss2} cuss2
 */
export class InsertionBelt extends Component {
  constructor(component: EnvironmentComponent, cuss2: Cuss2) {
    super(component, cuss2, DeviceType.INSERTION_BELT);
  }
}

/**
 * @class A component that provides audio feedback.
 * @param {EnvironmentComponent} component
 * @param {Cuss2} cuss2
 */
export class VerificationBelt extends Component {
  constructor(component: EnvironmentComponent, cuss2: Cuss2) {
    super(component, cuss2, DeviceType.VERIFICATION_BELT);
  }
}

/**
 * @class A component that provides audio feedback.
 * @param {EnvironmentComponent} component
 * @param {Cuss2} cuss2
 */
export class ParkingBelt extends Component {
  constructor(component: EnvironmentComponent, cuss2: Cuss2) {
    super(component, cuss2, DeviceType.PARKING_BELT);
  }
}
