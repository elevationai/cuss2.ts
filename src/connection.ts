import { EventEmitter } from "events";
import { helpers } from "./helper.ts";
import { PlatformResponseError } from "./models/platformResponseError.ts";
import { AuthenticationError } from "./models/Errors.ts";
import type { ApplicationData, PlatformData, UniqueID } from "cuss2-typescript-models";
import { AuthResponse } from "./models/authResponse.ts";
import { retry } from "jsr:@std/async/retry";

// const log = console.log
// Unused parameters are intentionally ignoreddeno cache --clear
const log = (..._args: unknown[]) => {};

interface ConnectionEvents {
  message: [PlatformData];
  error: [unknown];
  close: [CloseEvent];
  open: [];
}

// These are needed for overriding during testing
export const global = {
  WebSocket: globalThis.WebSocket,
  fetch: globalThis.fetch,
  clearTimeout: globalThis.clearTimeout.bind(globalThis),
  setTimeout: globalThis.setTimeout.bind(globalThis),
};

export class Connection extends EventEmitter {
  // declare emit: <K extends keyof ConnectionEvents>(event: K, ...args: ConnectionEvents[K]) => boolean;
  declare on: <K extends keyof ConnectionEvents>(event: K, listener: (data: PlatformData) => void) => this;
  // declare once: <K extends keyof ConnectionEvents>(event: K, listener: (...args: ConnectionEvents[K]) => void) => this;
  // declare off: <K extends keyof ConnectionEvents>(event: K, listener: (...args: ConnectionEvents[K]) => void) => this;

  _auth: { url: string; client_id: string; client_secret: string };
  _baseURL: string;
  _socketURL: string;
  _socket?: WebSocket;
  _refresher: ReturnType<typeof setTimeout> | null = null;
  deviceID: UniqueID;
  access_token = "";
  _retryOptions: {
    maxAttempts?: number;
    minTimeout?: number;
    maxTimeout?: number;
    multiplier?: number;
    jitter?: number;
  };

  get isOpen() {
    return this._socket && this._socket.readyState === 1; // OPEN
  }

  constructor(
    baseURL: string,
    tokenURL: string | null,
    deviceID: UniqueID,
    client_id: string,
    client_secret: string,
    retryOptions?: typeof Connection.prototype._retryOptions,
  ) {
    super();
    this.deviceID = deviceID;
    (this as EventEmitter).setMaxListeners(0); // Allow unlimited listeners

    // Clean up baseURL
    this._baseURL = this._cleanBaseURL(baseURL);

    // Set up token URL
    this._auth = {
      url: tokenURL || `${this._baseURL}/oauth/token`,
      client_id,
      client_secret,
    };

    // Set up WebSocket URL
    this._socketURL = this._buildWebSocketURL(this._baseURL);

    this._retryOptions = {
      maxAttempts: 99,
      minTimeout: 1000, //ms
      maxTimeout: 64000, //ms
      multiplier: 2,
      jitter: 0.25,
      ...retryOptions,
    };
  }

  static async authorize(
    url: string,
    client_id: string,
    client_secret: string,
  ): Promise<AuthResponse> {
    log("info", `Authorizing client '${client_id}'`, url);

    const params = new URLSearchParams();
    params.append("client_id", client_id);
    params.append("client_secret", client_secret);
    params.append("grant_type", "client_credentials");

    const response = await global.fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      redirect: "follow",
      body: params.toString(), // Form-encoded data
    });

    if (response.status === 401) {
      throw new AuthenticationError("Invalid Credentials", 401);
    }

    const data = await response.json();
    return {
      access_token: data.access_token,
      expires_in: data.expires_in,
      token_type: data.token_type,
    };
  }

  static async connect(
    baseURL: string,
    tokenURL: string | null,
    deviceID: string,
    client_id: string,
    client_secret: string,
    retryOptions?: typeof Connection.prototype._retryOptions,
  ): Promise<Connection> {
    using connection = new Connection(
      baseURL,
      tokenURL,
      deviceID,
      client_id,
      client_secret,
      retryOptions,
    );
    await connection._authenticateAndQueueTokenRefresh();
    await connection._createWebSocketAndAttachEventHandlers();
    return connection;
  }

  private _cleanBaseURL(url: string): string {
    // Remove query parameters if present
    // url.split always returns at least one element, so we can safely access [0]
    const parts = url.split("?");
    const cleanURL = parts[0];
    // Remove trailing slash if present
    return cleanURL.endsWith("/") ? cleanURL.slice(0, -1) : cleanURL;
  }

  private _buildWebSocketURL(baseURL: string): string {
    // If URL already has WebSocket protocol, return as is
    if (baseURL.startsWith("ws://") || baseURL.startsWith("wss://")) {
      return `${baseURL}/platform/subscribe`;
    }

    // Determine protocol based on existing URL
    const protocol = baseURL.startsWith("https") ? "wss" : "ws";
    const wsBase = baseURL.replace(/^https?:\/\//, "");

    return `${protocol}://${wsBase}/platform/subscribe`;
  }

  private async _authenticateAndQueueTokenRefresh(): Promise<void> {
    log("info", "Getting access_token");

    if (this._refresher) {
      global.clearTimeout(this._refresher);
      this._refresher = null;
    }

    try {
      const access_data = await Connection.authorize(
        this._auth.url,
        this._auth.client_id,
        this._auth.client_secret,
      );

      this.access_token = access_data.access_token;
      const expires = Math.max(0, access_data.expires_in);

      if (expires > 0) {
        log("info", `access_token expires in ${expires} seconds`);
        this._refresher = global.setTimeout(
          () => this._authenticateAndQueueTokenRefresh(),
          (expires - 1) * 1000,
        );
      }
    }
    catch (error) {
      log("error", "Authentication failed:", error);
      throw error;
    }
  }

  _createWebSocketAndAttachEventHandlers(): Promise<boolean> {
    let retrying = true;

    return retry(() =>
      new Promise<boolean>((resolve, reject) => {
        if (this.isOpen) {
          log("error", "open socket already exists");
          return resolve(true);
        }

        // This can create synchronous Errors and will reject the promise
        const socket = new global.WebSocket(this._socketURL);

        socket.onopen = () => {
          log("info", "Socket opened: ", this._socketURL);
          this._socket = socket;
          retrying = false;
          resolve(true);
          this.emit("open");
        };

        socket.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);

            if (data.ping) {
              socket.send(`{ "pong": ${Date.now()} }`);
              this.emit("ping", data);
              return;
            }

            if (data.ackCode) {
              this.emit("ack", data);
              return;
            }

            log("socket.onmessage", event);
            const platformData = data as PlatformData;
            this.emit("message", platformData);

            if (platformData?.meta?.requestID) {
              this.emit(String(platformData.meta.requestID), platformData);
            }
          }
          catch (error) {
            log("error", "Error processing message:", error);
            this.emit("error", error);
          }
        };

        socket.onclose = (e) => {
          log("Websocket Close:", e.reason);
          socket.onopen = null;
          socket.onclose = null;
          socket.onerror = null;
          socket.onmessage = null;

          this.emit("close", e);

          // normal close (probably from calling the close() method)
          if (e.code === 1000) return;

          if (retrying) {
            reject(e); // cause retry to try again
          }
        };

        socket.onerror = (e) => {
          log("Websocket Error:", e);
          this.emit("error", e);
        };
      }), this._retryOptions);
  }

  send(data: ApplicationData) {
    if (data instanceof Object && !data.meta?.oauthToken) {
      data.meta.oauthToken = this.access_token;
    }
    if (data instanceof Object && !data.meta?.deviceID) {
      data.meta.deviceID = this.deviceID;
    }
    this._socket?.send(JSON.stringify(data));
  }

  async sendAndGetResponse(
    applicationData: ApplicationData,
  ): Promise<PlatformData> {
    if (!this._socket) {
      throw new Error("WebSocket is not connected");
    }
    const meta = applicationData.meta;
    const reqId = meta.requestID as string;
    meta.oauthToken = this.access_token;
    if ((meta.deviceID == null || meta.deviceID == "00000000-0000-0000-0000-000000000000") && this.deviceID != null) {
      meta.deviceID = this.deviceID;
    }
    const promise = this.waitFor(reqId);
    this._socket.send(JSON.stringify(applicationData));
    const message = (await promise) as PlatformData;
    const messageCode = message.meta?.messageCode;
    if (messageCode && helpers.isNonCritical(messageCode)) {
      return message;
    }
    else {
      throw new PlatformResponseError(message);
    }
  }

  close(code?: number, reason?: string): void {
    if (this._refresher) {
      global.clearTimeout(this._refresher);
      this._refresher = null;
    }

    this._socket?.close(code, reason);
  }

  waitFor(event: string) {
    return new Promise((resolve, reject) => {
      const resolver = (e: unknown) => {
        this.off("close", catcher);
        resolve(e);
      };
      const catcher = (e: unknown) => {
        this.off(event, resolver);
        reject(e);
      };
      this.once(event, resolver);
      this.once("close", catcher);
    });
  }

  [Symbol.dispose]() {
    if (this._refresher) {
      clearTimeout(this._refresher);
    }
  }
}
