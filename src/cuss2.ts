/*
==============================================================================
 Project: CUSS2.js
 Company: VisionBox
 License: MIT License
 Last Updated: 2024-09-26
==============================================================================
*/

import { log, logger, Build } from "./helper.js";
import {BehaviorSubject, Subject} from "rxjs";

import {Connection} from "./connection.js";
import {StateChange} from "./models/stateChange.js";
import {ComponentInterrogation} from "./componentInterrogation.js";
import { ApplicationActivationExecutionModeEnum, ApplicationStateCodes } from 'cuss2-typescript-models';
import {
	Announcement,
	BarcodeReader,
	Component,
	Dispenser,
	DocumentReader,
	Feeder,
	Keypad,
	CardReader,
	BagTagPrinter,
	BoardingPassPrinter,
	Illumination,
	Headset,
	FaceReader,
	Scale,
	Camera
} from "./models/component.js";

import {
	ApplicationActivation,
	// ApplicationState,
	MessageCodes,
	CUSSDataTypes,
	ComponentList,
	DataRecordList,
	EnvironmentLevel,
	PlatformData,
	PlatformDirectives,
	ApplicationStateCodes as AppState,
	ApplicationStateChangeReasonCodes as ChangeReason
} from "cuss2-typescript-models";

export { ApplicationStateCodes, DataRecordList };

const ExecutionModeEnum = ApplicationActivationExecutionModeEnum

const {
	isAnnouncement,
	isFeeder,
	isDispenser,
	isBagTagPrinter,
	isBoardingPassPrinter,
	isDocumentReader,
	isBarcodeReader,
	isCardReader,
	isFaceReader,
	isKeypad, isIllumination, isHeadset,
	isScale, isCamera
} = ComponentInterrogation;

/**
 * @function validateComponentId
 * @param {number} componentID - The componentID to validate
 * @throws {Error} If the componentID is not a number
 */
function validateComponentId(componentID:any) {
	if (typeof componentID !== 'number') {
		throw new TypeError('Invalid componentID: ' + componentID);
	}
}

/**
 * @class Class to create a CUSS 2 object, used it interface with a cuss platform.
 * @property {connection} connection - The connection object used to communicate with the cuss platform.
 * @property {EnvironmentLevel} environmentLevel - The environment level of the cuss platform. *Note* see IATA docs for more details.
 * @property {any | undefined} components - The components of the cuss platform.
 * @property {BehaviorSubject<Component|null>} stateChange - The state change subject that emits when the application state changes.
 * @property {BehaviorSubject<any>} componentStateChange - The component change subject emits when a component's state changes.
 * @property {Subject<PlatformData>} onmessage - The onmessage subject for unsolicited and solicited events. *Note* see IATA docs for more details.
 * @property {BagTagPrinter} bagTagPrinter - The bag tag printer component class to interact with the device.
 * @property {BoardingPassPrinter} boardingPassPrinter - The boarding pass printer component class to interact with the device.
 * @property {DocumentReader} documentReader - The document reader component class to interact with the device.
 * @property {BarcodeReader} barcodeReader - The barcode reader component class to interact with the device.
 * @property {Announcement} announcement - The announcement component class to interact with the device.
 * @property {Keypad} keypad - The keypad component class to interact with the device.
 * @property {CardReader} cardReader - The card reader component class to interact with the device.
 * @property {Subject<undefined>} activated - The activated subject will emit when the application moves to the active state.
 * @property {Subject<AppState>} deactivated - The deactivated subject emits when the application is moved from the active state. *Note* see IATA docs for more details. AppState is an alias for ApplicationStateCodeEnum.
 * @property {AppState} pendingStateChange - The  application pending state change. *Note* see IATA docs for more details.
 * @property {boolean} multiTenant - The multi tenant flag.
 * @property {boolean} accessibleMode - The accessible mode flag.
 * @property {string} language - The language.
 * @property {Subject<unknown>} onQueryError - The onQueryError subject emits when there is an error in caught from the queryComponents method.
 *
 * @example
 * // Connect to the cuss platform
 * this.cuss2.connection
 * @example
 * // Get the  current environment level
 * this.cuss2.environmentLevel
 * @example
 * // Get the components
 * this.cuss2.components
 * @example
 * // Subscribe to the state change subject
 * this.cuss2.stateChange.subscribe(stateChange => {
 * 	// Do something with the state change
 * });
 * @example
 * // Subscribe to the component state change subject
 * this.cuss2.componentStateChange.subscribe(componentStateChange => {
 * 	// Do something with the component state change
 * });
 * @example
 * // Subscribe to the onmessage subject
 * this.cuss2.onmessage.subscribe(onmessage => {
 * 	// Do something with the platform data
 * });
 * @example
 * // Get the bag tag printer object
 * // click here for more info
 * this.cuss2.bagTagPrinter
 * @example
 * // Get the boarding pass printer object
 * // click here for more info
 * this.cuss2.boardingPassPrinter
 * @example
 * // Get the document reader object
 * // click here for more info
 * this.cuss2.documentReader
 * @example
 * // Get the barcode reader object
 * // click here for more info
 * this.cuss2.barcodeReader
 * @example
 * // Get the announcement object
 * // click here for more info
 * this.cuss2.announcement
 * @example
 * // Get the keypad object
 * // click here for more info
 * this.cuss2.keypad
 * @example
 * // Get the card reader object
 * // click here for more info
 * this.cuss2.cardReader
 * @example
 * // Get the activated subject
 * this.cuss2.activated.subscribe(() => {
 * 	// Do something when the application is activated
 * });
 * @example
 * // Get the deactivated subject
 * this.cuss2.deactivated.subscribe((appState) => {
 * 	// Do something when the application is deactivated
 * });
 * @example
 * // Get the pending state change
 * this.cuss2.pendingStateChange
 * @example
 * // Get the multi tenant flag
 * this.cuss2.multiTenant
 * @example
 * // Get the accessible mode flag
 * this.cuss2.accessibleMode
 * @example
 * // Get the language
 * this.cuss2.language
 * @example
 * // Subscribe to the onQueryError subject
 * this.cuss2.onQueryError.subscribe((error) => {
 * 	console.log('error querying components', error)
 * 	// Do something with the error
 * });
 */
export class Cuss2 {

	/**
	 * @memberof Cuss2
	 * @method connect - Connect to the cuss platform.
	 * @param {string} wss  - The WebSocket URL for CUSS 2 platform
	 * @param {string} oauth - The URL for the Oauth2 server
	 * @param {string} deviceID - The GUID for the device connecting to the CUSS 2 platform
	 * @param {string} client_id  - The client_id of the CUSS 2 platform
	 * @param {string} client_secret  - The client_secret of the CUSS 2 platform
	 * @returns {Promise<Cuss2>} A promise that resolves to a Cuss2 object
	 * @example
	 * const connect = await Cuss2.connect('url', 'oauth', '00000000-0000-0000-0000-000000000000', 'client_id', 'client_secret');
	 *
	 */
	static async connect(wss: string, oauth: string = null, deviceID: string = '00000000-0000-0000-0000-000000000000', client_id: string, client_secret: string): Promise<Cuss2> {
		document.body.setAttribute('elevated-cuss2', '1')
		function broadcast(detail: any) {
			const event = new CustomEvent('send_to_cuss2_devtools', {detail});
			window.dispatchEvent(event);
		}
		logger.subscribe(broadcast);

		const connection = await Connection.connect(wss, oauth, deviceID, client_id, client_secret);
		const cuss2 = new Cuss2(connection);

		if (document.body.hasAttribute('cuss2-devtools')) {
			console.log('cuss2-devtools detected');
			// @ts-ignore
			window.addEventListener("execute_from_cuss2_devtools", async ({detail: {id, cmd, args=[]}}) => {
				console.log('EVENT:execute_from_cuss2_devtools', cmd, args)
				if (!cmd) return;
				const parts = cmd.split('.')
				let error, response, target = Cuss2._get(cuss2, parts);
				if (typeof target === 'function') {
					// @ts-ignore
					const parent = Cuss2._get(cuss2, parts.slice(0, -1));
					try {
						// @ts-ignore
						response = target.apply(parent, args);
						if (response instanceof Promise)
							response = await response;
					}
					catch(e) {error = e}
				}
				else response = target;
				broadcast({id, cmd, response, error});
			}, false);
		}

		await cuss2._initialize();
		return cuss2;
	}
	static _get(cuss2: Cuss2, parts: String[]) {
		// @ts-ignore
		return parts.reduce((obj, prop) => obj && obj[prop], cuss2)
	}

	static log = log;

	private constructor(connection: Connection) {
		this.connection = connection;
		// Subscribe to messages from the CUSS 2 platform
		connection.on('message', e => this._handleWebSocketMessage(e))
		// Subscribe to the connection being closed and attempt to reconnect
		connection.on('close', async () => {
			await connection._connect();
			await this._initialize();
		});
	}

	connection:Connection;
	environment: EnvironmentLevel = {} as EnvironmentLevel;
	components: any|undefined = undefined;
	stateChange: BehaviorSubject<StateChange> = new BehaviorSubject<StateChange>(new StateChange(AppState.STOPPED, AppState.STOPPED));
	componentStateChange: BehaviorSubject<Component|null> = new BehaviorSubject<Component|null>(null);
	onmessage: Subject<PlatformData> = new Subject<PlatformData>();
	onSessionTimeout: Subject<MessageCodes> = new Subject<MessageCodes>();

	bagTagPrinter?: BagTagPrinter;
	boardingPassPrinter?: BoardingPassPrinter;
	documentReader?: DocumentReader;
	barcodeReader?: BarcodeReader;
	illumination?: Illumination;
	announcement?: Announcement;
	keypad?: Keypad;
	cardReader?: CardReader;
	faceReader?: FaceReader;
	scale?: Scale;
	headset?:Headset;
	camera?: Camera;
	activated: Subject<ApplicationActivation> = new Subject<ApplicationActivation>();
	deactivated: Subject<AppState> = new Subject<AppState>();
	pendingStateChange?: AppState;
	multiTenant?: boolean;
	accessibleMode: boolean = false;
	language?: string;
	onQueryError: Subject<unknown> = new Subject<unknown>();

  /**
	* @typeof {StateChange.current} state Get the current application state from the CUSS 2 platform
	* @returns {AppState} The current application state
  */
	get state() {
		return this.stateChange.getValue().current;
	}

	async _initialize(): Promise<any> {
		log("info", "Getting Environment Information");
		let level = await this.api.getEnvironment();
		// hydrate device id if none provided
		if (this.connection.deviceID == '00000000-0000-0000-0000-000000000000' || this.connection.deviceID == null) {
			this.connection.deviceID = level.deviceID;
		}
		if (!this.state) {
			throw new Error('Platform in abnormal state.');
		}
		if (this.state === AppState.SUSPENDED) {
			throw new Error('Platform has SUSPENDED the application');
		}
		log("info", "Getting Component List");
		await this.api.getComponents();
		await this.queryComponents().catch((e) => {
			log("error",'error querying components', e)
			this.onQueryError.next(e)
		});
		await this.requestUnavailableState();
	}

	async _handleWebSocketMessage(event) {
		const message: PlatformData = JSON.parse(event.data)
		if (!message) return;
		const { meta, payload } = message;

		log('verbose', '[event.currentApplicationState]', meta.currentApplicationState);

		const unsolicited = !meta.platformDirective;

		let currentState:any = meta.currentApplicationState.applicationStateCode;

		if (meta.messageCode === MessageCodes.SESSIONTIMEOUT) {
			this.onSessionTimeout.next(meta.messageCode);
		}

		if(!currentState) {
			this.connection._socket?.close();
			throw new Error('Platform in invalid state. Cannot continue.');
		}
		if(currentState !== this.state) {
			const prevState = this.state;
			log('verbose', `[state changed] old:${prevState} new:${currentState}`);
			this.stateChange.next(new StateChange(prevState, currentState as AppState));

			if (currentState === AppState.UNAVAILABLE) {
				await this.queryComponents().catch((e) => {
					log("error",'error querying components', e)
					this.onQueryError.next(e)
				});
				if (this._online) {
					this.checkRequiredComponentsAndSyncState();
				}
			}
			else if (currentState === AppState.ACTIVE) {
				if (!payload.applicationActivation)
					//throw new Error('ApplicationActivation missing')
				this.multiTenant = payload?.applicationActivation?.executionMode === ExecutionModeEnum.MAM;
				this.accessibleMode = payload?.applicationActivation?.accessibleMode || false;
				this.language = payload?.applicationActivation?.languageID || 'en-US';
				this.activated.next(payload?.applicationActivation);
			}
			if (prevState === AppState.ACTIVE) {
				this.deactivated.next(currentState as AppState);
			}
		}

		if(typeof meta.componentID === 'number' && this.components) {
			const component = this.components[meta.componentID];
			if (component && component.stateIsDifferent(message)) {
				component.updateState(message);
				this.componentStateChange.next(component);
				if (this._online && (unsolicited || meta.platformDirective === PlatformDirectives.PeripheralsQuery)) {
					this.checkRequiredComponentsAndSyncState();
				}
			}
		}

		log('verbose', "[socket.onmessage]", message);

		this.onmessage.next(message)
	}

	api = {
		/**
		 * Get the current environment level.
		 * @memberof Cuss2
		 * @method getEnvironment
		 * @returns {Promise<EnvironmentLevel>} - The current environment level. *Note* see IATA docs for more details.
		 * @example
		 * // *Note* see IATA docs for more details.
		 * const environment = await cuss2.getEnvironment();
		 */
		getEnvironment: async (): Promise<EnvironmentLevel> => {
			const ad = Build.applicationData(PlatformDirectives.PlatformEnvironment)
			const response = await this.connection.sendAndGetResponse(ad)
			log('verbose', '[getEnvironment()] response', response);
			this.environment = response.payload.environmentLevel as EnvironmentLevel;
			return this.environment;
		},

		/**
		 * Get a list of components.
		 * @memberof Cuss2
		 * @method getComponents
		 * @returns {Promise<ComponentList>} - The list of components
		 * @example
		 * const components = await cuss2.getComponents();
		 */
		getComponents: async (): Promise<ComponentList> => {
			const ad = Build.applicationData(PlatformDirectives.PlatformComponents)
			const response = await this.connection.sendAndGetResponse(ad)
			log('verbose', '[getComponents()] response', response);
			const componentList = response.payload.componentList as ComponentList;
			if (this.components) return componentList;

			const components:any = this.components = {};

			//first find feeders & dispensers, so they can be linked when printers are created
			componentList.forEach((component) => {
				const id = String(component.componentID);
				let instance;

				if (isFeeder(component)) instance = new Feeder(component, this);
				else if (isDispenser(component)) instance = new Dispenser(component, this);
				else return;

				return components[id] = instance;
			});

			componentList.forEach((component) => {
				const id = String(component.componentID);
				let instance;

				if (isAnnouncement(component)) instance = this.announcement = new Announcement(component, this);
				else if (isBagTagPrinter(component)) instance = this.bagTagPrinter = new BagTagPrinter(component, this);
				else if (isBoardingPassPrinter(component)) instance = this.boardingPassPrinter = new BoardingPassPrinter(component, this);
				else if (isDocumentReader(component)) instance = this.documentReader = new DocumentReader(component, this);
				else if (isBarcodeReader(component)) instance = this.barcodeReader = new BarcodeReader(component, this);
				else if (isCardReader(component)) instance = this.cardReader = new CardReader(component, this);
				else if (isKeypad(component)) instance = this.keypad = new Keypad(component, this);
				else if (isFaceReader(component)) instance = this.faceReader = new FaceReader(component, this);
				else if (isScale(component)) instance = this.scale = new Scale(component, this);
				else if (isCamera(component)) instance = this.camera = new Camera(component, this);
				// subcomponents
				else if (isFeeder(component))  return; // instance = new Feeder(component, this);
				else if (isDispenser(component))  return; // instance = new Dispenser(component, this);
				else if (isIllumination(component)) instance = this.illumination = new Illumination(component, this);
				else if (isHeadset(component)) instance = this.headset = new Headset(component, this);
				else instance = new Component(component, this);

				return components[id] = instance;
			});

			return componentList;
		},

		/**
		 * Get the status of a given component (device).
		 * @memberof Cuss2
		 * @method getStatus
		 * @param {number} componentID - The ID of the desired device
		 * @returns {Promise<PlatformData>} - The status of the component. *Note* see IATA docs for more details.
		 * @example
		 * const status = await cuss2.getStatus(componentID);
		 */
		getStatus: async (componentID:number): Promise<PlatformData> => {
			const ad = Build.applicationData(PlatformDirectives.PeripheralsQuery, {componentID})
			const response = await this.connection.sendAndGetResponse(ad)
			log('verbose', '[queryDevice()] response', response);
			return response;
		},

		/**
		 * Send a command to a given component (device).
		 * @memberof Cuss2
		 * @method send
		 * @param {number} componentID - The ID of the desired device
		 * @param dataExchange - Object to exchange data between the application and platform. *Note* see IATA docs for more details.
		 * @returns {Promise<PlatformData>} *Note* see IATA docs for more details.
		 * @example
		 * const setup = await cuss2.send(componentID, dataExchange);
		 */
		send: async (componentID:number, dataObj:DataRecordList): Promise<PlatformData> => {
			const ad = Build.applicationData(PlatformDirectives.PeripheralsSend, {
				componentID,
				dataObj
			})
			return await this.connection.sendAndGetResponse(ad)
		},

		/**
		 * Send setup instructions to a given component (device).
		 * @memberof Cuss2
		 * @method setup
		 * @param {number} componentID - The ID of the desired device
		 * @param dataExchange - Object to exchange data between the application and platform. *Note* see IATA docs for more details.
		 * @returns {Promise<PlatformData>} *Note* see IATA docs for more details.
		 * @example
		 * const status = await cuss2.setup(componentID, dataExchange);
		 */
		setup: async (componentID:number, dataObj:DataRecordList): Promise<PlatformData> => {
			validateComponentId(componentID);
			const ad = Build.applicationData(PlatformDirectives.PeripheralsSetup, {
				componentID,
				dataObj
			})
			return await this.connection.sendAndGetResponse(ad)
		},

		/**
		 * Sends a cancel command to a given component (device).
		 * @memberof Cuss2
		 * @method cancel
		 * @param {number} componentID - The ID of the desired device
		 * @returns {Promise<PlatformData>} *Note* see IATA docs for more details.
		 * @example
		 * const statusCancel = await cuss2.cancel(componentID);
		 */
		cancel: async (componentID:number): Promise<PlatformData> => {
			validateComponentId(componentID);
			const ad = Build.applicationData(PlatformDirectives.PeripheralsCancel, {componentID})
			return await this.connection.sendAndGetResponse(ad)
		},

		/**
		 * Sends enable command to a given component (device).
		 * @memberof Cuss2
		 * @method enable
		 * @param {number} componentID - The ID of the desired device
		 * @returns {Promise<PlatformData>} *Note* see IATA docs for more details.
		 * @example
		 * const statusEnable = await cuss2.enable(componentID);
		 */
		enable: async (componentID:number): Promise<PlatformData> => {
			validateComponentId(componentID);
			const ad = Build.applicationData(PlatformDirectives.PeripheralsUserpresentEnable, {componentID})
			return await this.connection.sendAndGetResponse(ad)
		},

		/**
		 * Sends disable command to a given component (device).
		 * @memberof Cuss2
		 * @method disable
		 * @param {number} componentID - The ID of the desired device
		 * @returns {Promise<PlatformData>} *Note* see IATA docs for more details.
		 * @example
		 * const statusDisable = await cuss2.disable(componentID);
		 */
		disable: async (componentID:number): Promise<PlatformData> => {
			validateComponentId(componentID);
			const ad = Build.applicationData(PlatformDirectives.PeripheralsUserpresentDisable, {componentID})
			return await this.connection.sendAndGetResponse(ad)
		},
		offer: async (componentID:number): Promise<PlatformData> => {
			validateComponentId(componentID);
			const ad = Build.applicationData(PlatformDirectives.PeripheralsUserpresentOffer, {componentID})
			return await this.connection.sendAndGetResponse(ad)
		},

		/**
		 * Sends request to the platform for the application to change states.
		 * @memberof Cuss2
		 * @method staterequest
		 * @param {AppState} state - The state to change to.
		 * @param {ChangeReason} reasonCode - The enumerated reasonCode for the state change.
		 * @param {string} reason - The reason for the state change.
		 * @returns {Promise<PlatformData|undefined>} Response from the platform. *Note* see IATA docs for more details.
		 * @example
		 * const startRequest = await cuss2.staterequest(state, reasonCode, reason);
		 */
		staterequest: async (state: AppState, reasonCode = ChangeReason.NOTAPPLICABLE, reason = ''): Promise<PlatformData|undefined> => {
			if (this.pendingStateChange) {
				return Promise.resolve(undefined);
			}
			log("info", `Requesting ${state} state`);
			this.pendingStateChange = state;
			let response:PlatformData|undefined;
			try {
				const ad = Build.stateChange(state, reasonCode, reason)
				response = await this.connection.sendAndGetResponse(ad)
				return response;
			}
			finally {
				this.pendingStateChange = undefined;
			}
		},

		/**
		 * Sends announcement to a given component (device).
		 *
		 * @memberof Cuss2
		 * @namespace announcement
		 * @method announcement
		 * @param {number} componentID - The ID of the desired device
		 * @param {string} rawData - The message to send
		 * @returns {Promise<PlatformData>} *Note* see IATA docs for more details.
		 * @property {method} play - Play the announcement.
		 * @example
		 * const play = await cuss2.announcement.play(componentID, rawData);
		 * @property {method} pause - Pause the announcement.
		 * @example
		 * const stop = await cuss2.announcement.stop(componentID);
		 * @property {method} resume - Resume the announcement.
		 * @example
		 * const resume = await cuss2.announcement.resume(componentID);
		 * @property {method} stop - Stop the announcement.
		 * @example
		 * const stop = await cuss2.announcement.stop(componentID);
		 */
		announcement: {
			/**
			 * @memberof Cuss2.announcement
			 */
			play: async (componentID:number, rawData:string): Promise<PlatformData> => {
				validateComponentId(componentID);
				const dataObj = [{
					data: rawData as any,
					dsTypes: [ CUSSDataTypes.SSML ]
				}]
				const ad = Build.applicationData(PlatformDirectives.PeripheralsAnnouncementPlay, {
					componentID, dataObj
				})
				return await this.connection.sendAndGetResponse(ad)
			},

			/**
			 * @memberof Cuss2.announcement
			 */
			pause: async (componentID:number): Promise<PlatformData> => {
				validateComponentId(componentID);
				const ad = Build.applicationData(PlatformDirectives.PeripheralsAnnouncementPause, {componentID})
				return await this.connection.sendAndGetResponse(ad)
			},

			/**
			 * @memberof Cuss2.Announcement
			 */
			resume: async (componentID:number): Promise<PlatformData> => {
				validateComponentId(componentID);
				const ad = Build.applicationData(PlatformDirectives.PeripheralsAnnouncementResume, {componentID})
				return await this.connection.sendAndGetResponse(ad)
			},

			/**
			 * @memberof Cuss2.announcement
			 */
			stop: async (componentID:number): Promise<PlatformData> => {
				validateComponentId(componentID);
				const ad = Build.applicationData(PlatformDirectives.PeripheralsAnnouncementStop, {componentID})
				return await this.connection.sendAndGetResponse(ad)
			}
		}
	};

	//
	// State requests. Only offer the ones that are valid to request.
	//
	/**
	 * Request the platform to change the application state to Available state.
	 * @memberof Cuss2
	 * @method requestActiveState
	 * @returns {Promise<PlatformData|undefined>} Response from the platform. *Note* see IATA docs for more details.
	 * @example
	 * const requestActiveState = await cuss2.requestActiveState();
	 */
	async requestAvailableState(): Promise<PlatformData|undefined> {
		// allow hoping directly to AVAILABLE from INITIALIZE
		if (this.state === AppState.INITIALIZE) {
			await this.requestUnavailableState();
		}
		const okToChange = this.state === AppState.UNAVAILABLE || this.state === AppState.ACTIVE;

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
	/**
	 * Request the platform to change the application state to Unavailable state.
	 * @memberof Cuss2
	 * @method requestUnavailableState
	 * @returns {Promise<PlatformData|undefined>} Response from the platform. *Note* see IATA docs for more details.
	 * @example
	 * const requestUnavailableState = await cuss2.requestUnavailableState();
	 */
	requestUnavailableState(): Promise<PlatformData|undefined> {
		const okToChange = this.state === AppState.INITIALIZE || this.state === AppState.AVAILABLE || this.state === AppState.ACTIVE;

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
	/**
	 * Request the platform to change the application state to Stopped state.
	 * @memberof Cuss2
	 * @method requestStoppedState
	 * @returns {Promise<PlatformData|undefined>} Response from the platform. *Note* see IATA docs for more details.
	 * @example
	 * const requestStoppedState = await cuss2.requestStoppedState();
	 */
	requestStoppedState(): Promise<PlatformData|undefined> {
		return this.api.staterequest(AppState.STOPPED);
	}
	/**
	 * Request the platform to change the application state to Active state.
	 * @memberof Cuss2
	 * @method requestActiveState
	 * @returns {Promise<PlatformData|undefined>} Response from the platform.
	 * @example
	 * const requestActiveState = await cuss2.requestActiveState();
	 */
	requestActiveState(): Promise<PlatformData|undefined> {
		const okToChange = this.state === AppState.AVAILABLE || this.state === AppState.ACTIVE;
		return okToChange ? this.api.staterequest(AppState.ACTIVE) : Promise.resolve(undefined);
	}
	/**
	 * Request the platform to reload the application.
	 * @memberof Cuss2
	 * @method requestReload
	 * @returns {Promise<boolean>} Response from the platform whether it can reload or not.
	 * @example
	 * const requestReload = await cuss2.requestReload();
	 */
	async requestReload(): Promise<boolean> {
		const okToChange = !this.state || this.state === AppState.UNAVAILABLE || this.state === AppState.AVAILABLE || this.state === AppState.ACTIVE;
		if (!okToChange) {
			return Promise.resolve(false);
		}

		await this.api.staterequest(AppState.RELOAD);
		this.connection._socket?.close();
		return true;
	}

	/**
	 * Query each component for its current state.
	 * @memberof Cuss2
	 * @method queryComponents
	 * @returns {Promise<boolean>} Response from the platform, whether the query was able to be sent or not.
	 * @example
   * const queryComponents = await cuss2.queryComponents();
	 */
	async queryComponents(): Promise<boolean> {
		if (!this.components) {
			return false;
		}
		const componentList = Object.values(this.components) as Component[];
		await Promise.all(
			componentList.map(c => c.query()
				.catch(e => e)) //it rejects statusCodes that are not "OK" - but here we just need to know what it is, so ignore
			)
		return true;
	}

	/**
	 *
	 * @typeof unavailableComponents
	 * @returns {Component[]} List of unavailable components.
	 */
	get unavailableComponents(): Component[] {
		const components = Object.values(this.components) as Component[];
		return components.filter((c:Component) => !c.ready);
	}
	/**
	 * @typeof unavailableRequiredComponents
	 * @returns {Component[]} List of unavailable components that have been marked required.
	 */
	get unavailableRequiredComponents(): Component[] {
		return this.unavailableComponents.filter((c:Component) => c.required)
	}

	/**
	 * Check if all required components are available and move application to the appropriate state based on their status.
	 * @memberof Cuss2
	 * @method checkRequiredComponentsAndSyncState
	 * @example
	 * cuss2.checkRequiredComponentsAndSyncState();
	 */
	checkRequiredComponentsAndSyncState(): void {
		if (this.pendingStateChange) return;
		if (this._online) {
			const inactiveRequiredComponents = this.unavailableRequiredComponents;
			if (!inactiveRequiredComponents.length) {
				if (this.state === AppState.UNAVAILABLE) {
					log('verbose', '[checkRequiredComponentsAndSyncState] All required components OK ✅. Ready for AVAILABLE state.');
					this.requestAvailableState();
				}
			}
			else {
				log('verbose', '[checkRequiredComponentsAndSyncState] Required components UNAVAILABLE:', inactiveRequiredComponents.map((c: Component) => c.constructor.name));
				this.requestUnavailableState();
			}
		}
		else if (this.components) {
			this.requestUnavailableState();
		}
	}

	_online: boolean = false;
	get applicationOnline() { return this._online; }
	set applicationOnline(online:boolean) {
		this._online = online;
		this.checkRequiredComponentsAndSyncState();
	}
}

export {Connection} from "./connection.js";
export * from "cuss2-typescript-models";
export * from "./helper.js";
export * from "./componentInterrogation.js";
