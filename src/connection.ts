import { EventEmitter } from "node:events";
import { helpers } from "./helper.ts";
import { PlatformResponseError } from "./models/platformResponseError.ts";
import { AuthenticationError } from "./models/Errors.ts";
import type { ApplicationData, PlatformData } from "cuss2-typescript-models";
import { AuthResponse } from "./models/authResponse.ts";

// const log = console.log
// Unused parameters are intentionally ignoreddeno cache --clear
const log = (..._args: unknown[]) => {};

export class Connection extends EventEmitter {
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

    const response = await fetch(url, {
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

  static connect(
    baseURL: string,
    tokenURL: string | null,
    deviceID: string,
    client_id: string,
    client_secret: string,
  ): Promise<Connection> {
    const connection = new Connection(
      baseURL,
      tokenURL,
      deviceID,
      client_id,
      client_secret,
    );
    let delay = 0.5;
    async function attemptConnection(): Promise<Connection> {
      try {
        await connection._connect();
        return connection;
      } catch (err) {
        if (
          !(err instanceof AuthenticationError) || err.status === 401 ||
          err.message.match(/credentials/i)
        ) {
          throw err;
        }
        log("info", "Websocket connection failed: " + err.message, err);
        delay = Math.min(delay * 2, 5);
        log("info", `Retrying Websocket connection in ${delay} seconds`);
        await new Promise((resolve) => setTimeout(resolve, delay * 1000));
        return attemptConnection();
      }
    }
    return attemptConnection();
  }

  _auth: { url: string; client_id: string; client_secret: string };
  _baseURL: string;
  _socketURL: string;
  _socket?: WebSocket;
  _refresher: ReturnType<typeof setTimeout> | null = null;
  deviceID: string;
  access_token = "";

  constructor(
    baseURL: string,
    tokenURL: string | null,
    deviceID: string,
    client_id: string,
    client_secret: string,
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
  }

  private _cleanBaseURL(url: string): string {
    // Remove query parameters if present
    const cleanURL = url.split("?")[0];
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

  private async _authenticate(): Promise<void> {
    log("info", "Getting access_token");

    if (this._refresher) {
      clearTimeout(this._refresher);
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
        this._refresher = setTimeout(
          () => this._authenticate(),
          (expires - 1) * 1000,
        );
      }
    } catch (error) {
      log("error", "Authentication failed:", error);
      throw error;
    }
  }

  async _connect(): Promise<boolean> {
    await this._authenticate();

    return new Promise<boolean>((resolve) => {
      if (this._socket?.readyState === WebSocket.OPEN) {
        log("error", "open socket already exists");
        return resolve(true);
      }

      const socket = new WebSocket(this._socketURL);
      socket.onopen = () => {
        log("info", "Socket opened: ", this._socketURL);
        this._socket = socket;
        resolve(true);
      };

      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          if (data.ping) {
            socket.send(`{ "pong": ${Date.now()} }`);
            super.emit("ping", data);
            return;
          }

          if (data.ackCode) {
            super.emit("ack", data);
            return;
          }

          log("socket.onmessage", event);
          super.emit("message", event);

          const platformData = data as PlatformData;
          if (platformData?.meta?.requestID) {
            super.emit(platformData.meta.requestID, platformData);
          }
        } catch (error) {
          log("error", "Error processing message:", error);
          super.emit("error", error);
        }
      };

      socket.onerror = (e) => {
        log("Websocket Error:", e);
        super.emit("error", e);
      };

      socket.onerror = (e) => {
        log("Websocket Error:", e);
        super.emit("error", e);
      };
    });
  }

  send(data: ApplicationData) {
    if (data instanceof Object && !data.meta?.oauthToken) {
      data.meta.oauthToken = this.access_token;
    }
    if (data instanceof Object && !data.meta?.deviceID) {
      data.meta.deviceID = this.deviceID;
    }
    return this._socket?.send(JSON.stringify(data));
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
    if (
      (meta.deviceID == null ||
        meta.deviceID == "00000000-0000-0000-0000-000000000000") &&
      this.deviceID != null
    ) {
      meta.deviceID = this.deviceID;
    }
    const promise = this.waitFor(reqId);
    this._socket.send(JSON.stringify(applicationData));
    const message = (await promise) as PlatformData;
    const messageCode = message.meta?.messageCode;
    if (messageCode && helpers.isNonCritical(messageCode)) {
      return message;
    } else {
      throw new PlatformResponseError(message);
    }
  }

  close(code?: number, reason?: string): void {
    if (this._refresher) {
      clearTimeout(this._refresher);
      this._refresher = null;
    }

    this._socket?.close(code, reason);
    super.once("close", () => {
      super.removeAllListeners();
      if (this._socket) {
        this._socket.onopen = null;
        this._socket.onclose = null;
        this._socket.onerror = null;
        this._socket.onmessage = null;
      }
    });
  }

  waitFor(event: string) {
    return new Promise((resolve, reject) => {
      const resolver = (e: unknown) => {
        super.off("close", catcher);
        resolve(e);
      };
      const catcher = (e: unknown) => {
        super.off(event, resolver);
        reject(e);
      };
      super.once(event, resolver);
      super.once("close", catcher);
    });
  }
}
