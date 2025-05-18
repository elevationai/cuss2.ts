import { Build, log } from "./helper.ts";
import { EventEmitter } from "events";

import { Connection } from "./connection.ts";
import { StateChange } from "./models/stateChange.ts";
import { ComponentInterrogation } from "./componentInterrogation.ts";
import {
  AEASBD,
  Announcement,
  BagTagPrinter,
  BarcodeReader,
  BHS,
  Biometric,
  BoardingPassPrinter,
  Camera,
  CardReader,
  Component,
  Dispenser,
  DocumentReader,
  Feeder,
  Headset,
  Illumination,
  InsertionBelt,
  Keypad,
  ParkingBelt,
  RFID,
  Scale,
  VerificationBelt,
} from "./models/index.ts";

import {
  ApplicationActivationExecutionModeEnum,
  ApplicationStateChangeReasonCodes as ChangeReason,
  ApplicationStateCodes as AppState,
  ComponentList,
  CUSSDataTypes,
  DataRecordList,
  EnvironmentLevel,
  MessageCodes,
  PlatformData,
  PlatformDirectives,
} from "cuss2-typescript-models";

const ExecutionModeEnum = ApplicationActivationExecutionModeEnum;

const {
  isAnnouncement,
  isFeeder,
  isDispenser,
  isBagTagPrinter,
  isBoardingPassPrinter,
  isDocumentReader,
  isBarcodeReader,
  isCardReader,
  isBiometric,
  isKeypad,
  isIllumination,
  isHeadset,
  isScale,
  isCamera,
  isInsertionBelt,
  isParkingBelt,
  isRFIDReader,
  isVerificationBelt,
  isAEASBD,
  isBHS,
} = ComponentInterrogation;

function validateComponentId(componentID: unknown) {
  if (typeof componentID !== "number") {
    throw new TypeError("Invalid componentID: " + componentID);
  }
}

export class Cuss2 extends EventEmitter {
  connection: Connection;
  environment: EnvironmentLevel = {} as EnvironmentLevel;
  components: any | undefined = undefined;

  // State management
  private _currentState: StateChange = new StateChange(AppState.STOPPED, AppState.STOPPED);

  bagTagPrinter?: BagTagPrinter;
  boardingPassPrinter?: BoardingPassPrinter;
  documentReader?: DocumentReader;
  barcodeReader?: BarcodeReader;
  illumination?: Illumination;
  announcement?: Announcement;
  keypad?: Keypad;
  cardReader?: CardReader;
  biometric?: Biometric;
  scale?: Scale;
  insertionBelt?: InsertionBelt;
  verificationBelt?: VerificationBelt;
  parkingBelt?: ParkingBelt;
  rfid?: RFID;
  headset?: Headset;
  camera?: Camera;
  bhs?: BHS;
  aeasbd?: AEASBD;

  pendingStateChange?: AppState;
  multiTenant?: boolean;
  accessibleMode: boolean = false;
  language?: string;

  get state() {
    return this._currentState.current;
  }

  private constructor(connection: Connection) {
    super();
    this.connection = connection;
    // Subscribe to messages from the CUSS 2 platform
    connection.on("message", (e) => this._handleWebSocketMessage(e));
    connection.on("open", () => this._initialize());
  }

  static async connect(
    wss: string,
    oauth: string,
    deviceID: string = "00000000-0000-0000-0000-000000000000",
    client_id: string,
    client_secret: string,
  ): Promise<Cuss2> {
    const connection = await Connection.connect(
      wss,
      oauth,
      deviceID,
      client_id,
      client_secret,
    );
    const cuss2 = new Cuss2(connection);
    await cuss2._initialize();
    return cuss2;
  }

  async _initialize(): Promise<undefined> {
    log("info", "Getting Environment Information");
    const level = await this.api.getEnvironment();

    // hydrate device id if none provided
    const deviceID = this.connection.deviceID;
    if (deviceID == "00000000-0000-0000-0000-000000000000" || deviceID == null) {
      this.connection.deviceID = level.deviceID;
    }
    if (!this.state) {
      throw new Error("Platform in abnormal state.");
    }

    if (this.state === AppState.SUSPENDED || this.state === AppState.DISABLED) {
      throw new Error(`Platform has ${this.state} the application`);
    }

    log("info", "Getting Component List");
    await this.api.getComponents();
    await this.queryComponents().catch((e) => {
      log("error", "error querying components", e);
      super.emit("queryError", e);
    });
  }

  async _handleWebSocketMessage(platformData: PlatformData) {
    if (!platformData) return;
    const { meta, payload } = platformData;

    log("verbose", "[event.currentApplicationState]", meta.currentApplicationState);

    const unsolicited = !meta.platformDirective;
    const currentState: AppState = meta.currentApplicationState.applicationStateCode;

    if (meta.messageCode === MessageCodes.SESSIONTIMEOUT) {
      super.emit("sessionTimeout", meta.messageCode);
    }

    if (!currentState) {
      this.connection._socket?.close();
      throw new Error("Platform in invalid state. Cannot continue.");
    }
    if (currentState !== this.state) {
      const prevState = this.state;
      log("verbose", `[state changed] old:${prevState} new:${currentState}`);

      // Update current state and emit event
      this._currentState = new StateChange(prevState, currentState as AppState);
      super.emit("stateChange", this._currentState);

      if (currentState === AppState.UNAVAILABLE) {
        await this.queryComponents().catch((e) => {
          log("error", "error querying components", e);
          super.emit("queryError", e);
        });
        if (this._online) {
          this.checkRequiredComponentsAndSyncState();
        }
      } else if (currentState === AppState.ACTIVE) {
        if (!payload?.applicationActivation) {
          this.multiTenant = payload?.applicationActivation?.executionMode === ExecutionModeEnum.MAM;
        }
        this.accessibleMode = payload?.applicationActivation?.accessibleMode || false;
        this.language = payload?.applicationActivation?.languageID || "en-US";
        super.emit("activated", payload?.applicationActivation);
      }
      if (prevState === AppState.ACTIVE) {
        super.emit("deactivated", currentState as AppState);
      }
    }

    if (typeof meta.componentID === "number" && this.components) {
      const component = this.components[meta.componentID];
      if (component && component.stateIsDifferent(platformData)) {
        component.updateState(platformData);

        super.emit("componentStateChange", component);

        if (
          this._online &&
          (unsolicited ||
            meta.platformDirective === PlatformDirectives.PeripheralsQuery)
        ) {
          this.checkRequiredComponentsAndSyncState();
        }
      }
    }

    log("verbose", "[socket.onmessage]", platformData);

    // Emit platform message
    super.emit("message", platformData);
  }

  api = {
    getEnvironment: async (): Promise<EnvironmentLevel> => {
      const ad = Build.applicationData(PlatformDirectives.PlatformEnvironment);
      const response = await this.connection.sendAndGetResponse(ad);
      log("verbose", "[getEnvironment()] response", response);
      this.environment = response.payload.environmentLevel as EnvironmentLevel;
      return this.environment;
    },

    getComponents: async (): Promise<ComponentList> => {
      const ad = Build.applicationData(PlatformDirectives.PlatformComponents);
      const response = await this.connection.sendAndGetResponse(ad);
      log("verbose", "[getComponents()] response", response);
      const componentList = response.payload.componentList as ComponentList;
      if (this.components) return componentList;

      const components: any = this.components = {};

      //first find feeders & dispensers, so they can be linked when printers are created
      componentList.forEach((component) => {
        const id = String(component.componentID);
        let instance;

        if (isFeeder(component)) instance = new Feeder(component, this);
        else if (isDispenser(component)) {
          instance = new Dispenser(component, this);
        } else return;

        return components[id] = instance;
      });

      componentList.forEach((component) => {
        const id = String(component.componentID);
        let instance;

        if (isAnnouncement(component)) {
          instance = this.announcement = new Announcement(component, this);
        } else if (isBagTagPrinter(component)) {
          instance = this.bagTagPrinter = new BagTagPrinter(component, this);
        } else if (isBoardingPassPrinter(component)) {
          instance = this.boardingPassPrinter = new BoardingPassPrinter(
            component,
            this,
          );
        } else if (isDocumentReader(component)) {
          instance = this.documentReader = new DocumentReader(component, this);
        } else if (isBarcodeReader(component)) {
          instance = this.barcodeReader = new BarcodeReader(component, this);
        } else if (isCardReader(component)) {
          instance = this.cardReader = new CardReader(component, this);
        } else if (isKeypad(component)) {
          instance = this.keypad = new Keypad(component, this);
        } else if (isBiometric(component)) {
          instance = this.biometric = new Biometric(component, this);
        } else if (isScale(component)) {
          instance = this.scale = new Scale(component, this);
        } else if (isCamera(component)) {
          instance = this.camera = new Camera(component, this);
        } else if (isInsertionBelt(component)) {
          instance = this.insertionBelt = new InsertionBelt(component, this);
        } else if (isVerificationBelt(component)) {
          instance = this.verificationBelt = new VerificationBelt(
            component,
            this,
          );
        } else if (isParkingBelt(component)) {
          instance = this.parkingBelt = new ParkingBelt(component, this);
        } else if (isRFIDReader(component)) {
          instance = this.rfid = new RFID(component, this);
        } else if (isBHS(component)) {
          instance = this.bhs = new BHS(component, this);
        } else if (isAEASBD(component)) {
          instance = this.aeasbd = new AEASBD(component, this);
        } // subcomponents
        else if (isFeeder(component)) return; // instance = new Feeder(component, this);
        else if (isDispenser(component)) return; // instance = new Dispenser(component, this);
        else if (isIllumination(component)) {
          instance = this.illumination = new Illumination(component, this);
        } else if (isHeadset(component)) {
          instance = this.headset = new Headset(component, this);
        } else instance = new Component(component, this);

        return components[id] = instance;
      });

      return componentList;
    },

    getStatus: async (componentID: number): Promise<PlatformData> => {
      const ad = Build.applicationData(PlatformDirectives.PeripheralsQuery, {
        componentID,
      });
      const response = await this.connection.sendAndGetResponse(ad);
      log("verbose", "[queryDevice()] response", response);
      return response;
    },

    send: async (
      componentID: number,
      dataObj: DataRecordList,
    ): Promise<PlatformData> => {
      const ad = Build.applicationData(PlatformDirectives.PeripheralsSend, {
        componentID,
        dataObj,
      });
      return await this.connection.sendAndGetResponse(ad);
    },

    setup: async (
      componentID: number,
      dataObj: DataRecordList,
    ): Promise<PlatformData> => {
      validateComponentId(componentID);
      const ad = Build.applicationData(PlatformDirectives.PeripheralsSetup, {
        componentID,
        dataObj,
      });
      return await this.connection.sendAndGetResponse(ad);
    },

    cancel: async (componentID: number): Promise<PlatformData> => {
      validateComponentId(componentID);
      const ad = Build.applicationData(PlatformDirectives.PeripheralsCancel, {
        componentID,
      });
      return await this.connection.sendAndGetResponse(ad);
    },

    enable: async (componentID: number): Promise<PlatformData> => {
      validateComponentId(componentID);
      const ad = Build.applicationData(
        PlatformDirectives.PeripheralsUserpresentEnable,
        { componentID },
      );
      return await this.connection.sendAndGetResponse(ad);
    },

    disable: async (componentID: number): Promise<PlatformData> => {
      validateComponentId(componentID);
      const ad = Build.applicationData(
        PlatformDirectives.PeripheralsUserpresentDisable,
        { componentID },
      );
      return await this.connection.sendAndGetResponse(ad);
    },
    offer: async (componentID: number): Promise<PlatformData> => {
      validateComponentId(componentID);
      const ad = Build.applicationData(
        PlatformDirectives.PeripheralsUserpresentOffer,
        { componentID },
      );
      return await this.connection.sendAndGetResponse(ad);
    },

    staterequest: async (
      state: AppState,
      reasonCode = ChangeReason.NOTAPPLICABLE,
      reason = "",
    ): Promise<PlatformData | undefined> => {
      if (this.pendingStateChange) {
        return Promise.resolve(undefined);
      }
      log("info", `Requesting ${state} state`);
      this.pendingStateChange = state;
      let response: PlatformData | undefined;
      try {
        const ad = Build.stateChange(state, reasonCode, reason);
        response = await this.connection.sendAndGetResponse(ad);
        return response;
      } finally {
        this.pendingStateChange = undefined;
      }
    },

    announcement: {
      play: async (
        componentID: number,
        rawData: string,
      ): Promise<PlatformData> => {
        validateComponentId(componentID);
        const dataObj = [{
          data: rawData as any,
          dsTypes: [CUSSDataTypes.SSML],
        }];
        const ad = Build.applicationData(
          PlatformDirectives.PeripheralsAnnouncementPlay,
          {
            componentID,
            dataObj,
          },
        );
        return await this.connection.sendAndGetResponse(ad);
      },

      pause: async (componentID: number): Promise<PlatformData> => {
        validateComponentId(componentID);
        const ad = Build.applicationData(
          PlatformDirectives.PeripheralsAnnouncementPause,
          { componentID },
        );
        return await this.connection.sendAndGetResponse(ad);
      },

      resume: async (componentID: number): Promise<PlatformData> => {
        validateComponentId(componentID);
        const ad = Build.applicationData(
          PlatformDirectives.PeripheralsAnnouncementResume,
          { componentID },
        );
        return await this.connection.sendAndGetResponse(ad);
      },

      stop: async (componentID: number): Promise<PlatformData> => {
        validateComponentId(componentID);
        const ad = Build.applicationData(
          PlatformDirectives.PeripheralsAnnouncementStop,
          { componentID },
        );
        return await this.connection.sendAndGetResponse(ad);
      },
    },
  };

  async requestAvailableState(): Promise<PlatformData | undefined> {
    // allow hoping directly to AVAILABLE from INITIALIZE
    if (this.state === AppState.INITIALIZE) {
      await this.requestUnavailableState();
    }
    const okToChange = this.state === AppState.UNAVAILABLE ||
      this.state === AppState.ACTIVE;

    if (okToChange && this.state === AppState.ACTIVE) {
      if (this.components) {
        const componentList = Object.values(this.components) as Component[];
        for await (const component of componentList) {
          if (component.enabled) {
            await component.disable();
          }
        }
      }
    }

    return okToChange ? this.api.staterequest(AppState.AVAILABLE) : Promise.resolve(undefined);
  }

  requestUnavailableState(): Promise<PlatformData | undefined> {
    const okToChange = this.state === AppState.INITIALIZE ||
      this.state === AppState.AVAILABLE || this.state === AppState.ACTIVE;

    if (okToChange && this.state === AppState.ACTIVE) {
      if (this.components) {
        const componentList = Object.values(this.components) as Component[];
        componentList.forEach(async (component: Component) => {
          if (component.enabled) {
            await component.disable();
          }
        });
      }
    }

    return okToChange ? this.api.staterequest(AppState.UNAVAILABLE) : Promise.resolve(undefined);
  }

  requestStoppedState(): Promise<PlatformData | undefined> {
    return this.api.staterequest(AppState.STOPPED);
  }

  requestActiveState(): Promise<PlatformData | undefined> {
    const okToChange = this.state === AppState.AVAILABLE ||
      this.state === AppState.ACTIVE;
    return okToChange ? this.api.staterequest(AppState.ACTIVE) : Promise.resolve(undefined);
  }

  async requestReload(): Promise<boolean> {
    const okToChange = !this.state || this.state === AppState.UNAVAILABLE ||
      this.state === AppState.AVAILABLE || this.state === AppState.ACTIVE;
    if (!okToChange) {
      return Promise.resolve(false);
    }

    await this.api.staterequest(AppState.RELOAD);
    this.connection._socket?.close();
    return true;
  }

  async queryComponents(): Promise<boolean> {
    if (!this.components) {
      return false;
    }
    const componentList = Object.values(this.components) as Component[];
    await Promise.all(
      componentList.map((c) =>
        c.query()
          .catch((e) => e)
      ), //it rejects statusCodes that are not "OK" - but here we just need to know what it is, so ignore
    );
    return true;
  }

  get unavailableComponents(): Component[] {
    const components = Object.values(this.components) as Component[];
    return components.filter((c: Component) => !c.ready);
  }

  get unavailableRequiredComponents(): Component[] {
    return this.unavailableComponents.filter((c: Component) => c.required);
  }

  checkRequiredComponentsAndSyncState(): void {
    if (this.pendingStateChange) return;
    if (this._online) {
      const inactiveRequiredComponents = this.unavailableRequiredComponents;
      if (!inactiveRequiredComponents.length) {
        if (this.state === AppState.UNAVAILABLE) {
          log(
            "verbose",
            "[checkRequiredComponentsAndSyncState] All required components OK ✅. Ready for AVAILABLE state.",
          );
          this.requestAvailableState();
        }
      } else {
        log(
          "verbose",
          "[checkRequiredComponentsAndSyncState] Required components UNAVAILABLE:",
          inactiveRequiredComponents.map((c: Component) => c.constructor.name),
        );
        this.requestUnavailableState();
      }
    } else if (this.components) {
      this.requestUnavailableState();
    }
  }

  _online: boolean = false;
  get applicationOnline() {
    return this._online;
  }
  set applicationOnline(online: boolean) {
    this._online = online;
    this.checkRequiredComponentsAndSyncState();
  }
}
