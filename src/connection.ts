/*
==============================================================================
 Project: CUSS2.js
 Company: VisionBox
 License: MIT License
 Last Updated: 2024-09-26
==============================================================================
*/

import { EventEmitter } from "https://deno.land/std/node/events.ts";
import { helpers } from "./helper.ts";
import { PlatformResponseError } from "./models/platformResponseError.ts";
import type { ApplicationData } from "cuss2-typescript-models";

// const log = console.log
const log = (...args: any[]) => {}

/**
 * @class Connection
 */
export class Connection extends EventEmitter {
  /**
   * Retrieve a token from the CUSS Oauth Server using a client id and client secret
   * @param {string} url - The url of the CUSS 2 platform
   * @param {string} client_id - The client_id of the CUSS 2 platform
   * @param {string} client_secret - The client_secret of the CUSS 2 platform
   * @returns {Promise<string>} - The token
   * @example
   * /// Retrieve a token from the CUSS Oauth Server using a client id and client secret
   * const token = await Connection.authorize('url', 'my-client-id', 'my-client-secret');
   */
  static async authorize(url: string, client_id: string, client_secret: string) {
    log('info', `Authorizing client '${client_id}'`, url);
  
    const params = new URLSearchParams();
    params.append('client_id', client_id);
    params.append('client_secret', client_secret);
    params.append('grant_type', 'client_credentials');
  
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      redirect: 'follow',
      body: params.toString() // Form-encoded data
    });
  
    if (response.status === 401) {
      throw { message: 'Invalid Credentials', status: 401 };
    }
    return response.json();
  }


  /**
   * Connects to a CUSS Platform at the provided URL
   * @param {string} baseURL - url of the CUSS Platform
   * @param {string} tokenURL - The url of the CUSS Oauth Server
   * @param {string} deviceID - The GUID for the device connecting to the CUSS 2 platform
   * @param {string} client_id - The client_id of the CUSS 2 platform
   * @param {string} client_secret - The client_secret of the CUSS 2 platform
   * @returns {Promise<Connection>} - The connection object
   * @example
   * /// Connects to a CUSS Platform at the provided URL
   * const connection = await Connection.connect('url', 'my-client-id', 'my-client-secret', 'token-url');
   */
  static async connect(baseURL: string, tokenURL: string | null, deviceID: string, client_id: string, client_secret: string) {
    const connection = new Connection(baseURL, tokenURL, deviceID, client_id, client_secret)
    let delay = 0.5
    function go() {
      return connection._connect().catch(async (err) => {
        if (err.status === 401 || err.message.match(/credentials/i)) {
          throw err
        }
        log('info', 'Websocket connection failed: ' + err.message, err)
        delay *= 2
        log('info', `Retrying Websocket connection in ${delay} seconds`)
        await new Promise((resolve) => setTimeout(resolve, delay * 1000))
        return go()
      })
    }
    await go()
    return connection
  }

  _auth: { url: string, client_id: string, client_secret: string };
  _baseURL: string;
  _socketURL: string;
  _socket?: WebSocket;
  pingInterval = 0;
  _refresher: number = 0;
  deviceID: string;
  access_token = '';

  constructor(baseURL: string, tokenURL: string | null, deviceID: string, client_id: string, client_secret: string) {
    super()
    this.deviceID = deviceID
    this.setMaxListeners(0)

    const endOfHostname = baseURL.indexOf('?')
    if (endOfHostname > -1) {
      baseURL = baseURL.substring(0, endOfHostname)
    }
    if (baseURL.endsWith('/')) {
      baseURL = baseURL.substring(0, baseURL.length - 1)
    }
    this._baseURL = baseURL

    let _tokenURL = tokenURL
    if (!_tokenURL) {
      _tokenURL = baseURL + '/oauth/token'
    }
    this._auth = { url: _tokenURL, client_id, client_secret }

    let protocol;
    if (/^wss?:\/\//.test(baseURL)) {
      // If the URL already starts with ws:// or wss://, no need to prepend a protocol
      protocol = '';
    } else {
        // Otherwise, determine the protocol based on the existing URL
        protocol = /^https/.test(baseURL) ? "wss" : "ws";
    }

    this._socketURL = protocol + baseURL.replace(/^https/, '').replace(/^http/, '') + '/platform/subscribe';
  }

  async _connect() {
    let access_token, expires = 0
    const _authenticate = async () => {
      log('info', 'Getting access_token')
      if (this._refresher)
        clearTimeout(this._refresher)

      const access_data = await Connection.authorize(
        this._auth.url,
        this._auth.client_id,
        this._auth.client_secret
      )
      access_token = access_data["access_token"]
      expires = Math.max(0, access_data["expires_in"])
      this.access_token = access_token
      if (expires) {
        log('info', `access_token expires in ${expires} seconds`)
        this._refresher = setTimeout(_authenticate, (expires - 1) * 1000) as unknown as number
      }
    }
    await _authenticate()

    return new Promise<boolean>(async (resolve) => {
      if (this._socket && this._socket.readyState === 1) {
        log('error', 'open socket already exists')
        return resolve(true)
      }
      const socket = new WebSocket(this._socketURL, [], {origin:this._baseURL});

      socket.onopen = () => {
        log('info', "Socket opened: ", this._socketURL)
        this._socket = socket
        resolve(true)
      }
      socket.onmessage = (event) => {
        const data = JSON.parse(event.data)
        if (data.ping) {
          socket.send(`{ "pong": ${Date.now()} }`)
          return this.emit('ping', data)
        }
        if (data.ackCode) {
          return this.emit('ack', data)
        }

        log('socket.onmessage', event)
        this.emit('message', event)
        if (data.meta?.requestID) {
          this.emit(data.meta.requestID, data)
        }
        
      }
      socket.onclose = (e) => {
        log('Websocket Close:', e.reason)
        this.emit('close', e)
      }
      socket.onerror = (e) => {
        log('Websocket Error:', e)
        this.emit('error', e)
      }
    });
  }

  send(data: ApplicationData | any) {
    if (data instanceof Object && !data.meta?.oauthToken) {
      data.meta.oauthToken = this.access_token
    }
    if (data instanceof Object && !data.meta?.deviceID) {
      data.meta.deviceID = this.deviceID
    }
    data = JSON.stringify(data)
    return this._socket?.send(data)
  }

  sendAndGetResponse(applicationData: ApplicationData) {
    const reqId = applicationData.meta.requestID
    applicationData.meta.oauthToken = this.access_token
    if ((applicationData.meta.deviceID == null || applicationData.meta.deviceID == "00000000-0000-0000-0000-000000000000")
       && this.deviceID != null) {
      applicationData.meta.deviceID = this.deviceID
    }
    const promise = this.waitFor(reqId)
    this._socket?.send(JSON.stringify(applicationData))
    return promise.then(message => {
      const messageCode = message.meta.messageCode;
      if (helpers.isNonCritical(messageCode)) {
        return message;
      } else {
        throw new PlatformResponseError(message);
      }
    })
  }

  close(...args: any[]) {
    clearTimeout(this._refresher)
    this._socket?.close(...args)
    this.once('close', ()=> {
      super.removeAllListeners()
      if (this._socket) {
        this._socket.onopen = null;
        this._socket.onclose = null;
        this._socket.onerror = null;
        this._socket.onmessage = null;
      }
    })
  }

  waitFor(event: string) {
    return new Promise((resolve, reject) => {
      const resolver = (e: any) => {
        this.off('close', catcher)
        resolve(e)
      }
      const catcher = (e: any) => {
        this.off(event, resolver)
        reject(e)
      }
      this.once(event, resolver)
      this.once('close', catcher)
    })
  }
}