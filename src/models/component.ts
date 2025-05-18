import { EventEmitter } from "events";
import { Cuss2 } from "../cuss2.ts";
import {
  ComponentState,
  EnvironmentComponent,
  MessageCodes,
  PlatformData,
} from "cuss2-typescript-models";
import { DeviceType } from "./deviceType.ts";

// Define an interface for the API to replace 'any'
interface ComponentAPI {
  enable: (id: number) => Promise<PlatformData>;
  disable: (id: number) => Promise<PlatformData>;
  cancel: (id: number) => Promise<PlatformData>;
  getStatus: (id: number) => Promise<PlatformData>;
  setup: (id: number, data: Record<string, unknown>) => Promise<PlatformData>;
  send: (id: number, data: Record<string, unknown>) => Promise<PlatformData>;
}

export class Component extends EventEmitter {
  _component: EnvironmentComponent;
  id: number;
  api!: ComponentAPI; // Using definite assignment assertion
  required: boolean = false;
  _status: MessageCodes = MessageCodes.OK;
  _componentState: ComponentState = ComponentState.UNAVAILABLE;
  deviceType: DeviceType;
  pendingCalls: number = 0;
  enabled: boolean = false;
  pollingInterval = 10000;
  _poller: ReturnType<typeof setTimeout> | undefined;
  parent: Component | null;
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
    this.parent = null;

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
      const name = this.deviceType;
      const parentId = Math.min(
        this.id,
        ...component.linkedComponentIDs as number[],
      );
      if (parentId != this.id) {
        this.parent = cuss2.components[parentId] as Component;
        // feeder and dispenser are created in the printer component
        if (this.parent) {
          this.parent.subcomponents.push(this);
          // We need to use bracket notation to access dynamic properties
          // Explicitly tell TypeScript that this is safe by using indexing
          (this.parent as unknown as Record<string, Component>)[name] = this;
        }
      }
    }
  }

  stateIsDifferent(msg: PlatformData): boolean {
    return this.status !== msg.meta.messageCode || this._componentState !== msg.meta.componentState;
  }

  updateState(msg: PlatformData): void {
    const { meta } = msg;
    if (meta.componentState !== this._componentState) {
      this._componentState = meta.componentState ?? ComponentState.UNAVAILABLE;
      if (meta.componentState !== ComponentState.READY) {
        this.enabled = false;
      }

      // Emit ready state change event
      this.emit("readyStateChange", meta.componentState === ComponentState.READY);
    }

    // Sometimes status is not sent by an unsolicited event so we poll to be sure
    if (!this.ready && this.required && !this._poller && this.pollingInterval > 0) {
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

  _handleMessage(data: PlatformData) {
    this.emit("message", data);
  }

  async _call(action: () => Promise<PlatformData>) {
    this.pendingCalls++;
    try {
      return await action();
    }
		catch (e) {
      return await Promise.reject(e);
    }
		finally {
			this.pendingCalls--;
		}
  }

  async enable(): Promise<PlatformData> {
    const r = await this._call(() => this.api.enable(this.id));
    this.enabled = true;
    return r;
  }

  async disable(): Promise<PlatformData> {
    try {
      const r = await this._call(() => this.api.disable(this.id));
      this.enabled = false;
      return r;
    }
		catch (e: unknown) {
			const pd = e as PlatformData;
      if (pd.meta.messageCode === MessageCodes.OUTOFSEQUENCE) {
        this.enabled = false;
        return pd;
      }
      return Promise.reject(e);
    }
  }

  async cancel(): Promise<PlatformData> {
    return await this._call(() => this.api.cancel(this.id));
  }

  async query(): Promise<PlatformData> {
    return await this._call(() => this.api.getStatus(this.id));
  }

  async setup(dataObj: Record<string, unknown>): Promise<PlatformData> {
		return await this._call(() => this.api.setup(this.id, dataObj));
  }

  async send(dataObj: Record<string, unknown>): Promise<PlatformData> {
		return await this._call(() => this.api.send(this.id, dataObj));
  }
}
