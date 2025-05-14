import { EventEmitter } from "events";
import {
	ApplicationData,
	ApplicationDataMeta,
	ApplicationDataPayload,
	ApplicationState,
	ApplicationTransfer, BaggageData, CommonUsePaymentMessage, CUSS2BiometricsDomainCommonUseBiometricMessage,
	CUSS2IlluminationDomainIlluminationData,
	DataRecordList,
	MessageCodes,
	PlatformDirectives,
	ScreenResolution,
} from "cuss2-typescript-models";

export class LogMessage {
  action: string;
  data: unknown;
  level: string;

  constructor(level: string, action: string, data: unknown) {
    this.action = action;
    this.level = level;
    this.data = data;
  }
}

export const logger = new EventEmitter();
export const log = (level: string, action: string, data?: unknown) => {
  logger.emit("log", new LogMessage(level, action, data));
};

export const helpers = {
  splitAndFilter: (text: string, delimiter1 = "#"): string[] => {
    return text.split(delimiter1).filter((p) => !!p);
  },
  split_every: (text: string, n: number): string[] => {
    return text.match(new RegExp(".{1," + n + "}", "g")) as string[];
  },
  deserializeDictionary: (
    text: string,
    delimiter1 = "#",
    delimiter2 = "=",
  ): Record<string, string> => {
    const out: Record<string, string> = {};
    helpers.splitAndFilter(text, delimiter1).forEach((p) => {
      const [k, v] = p.split(delimiter2);
      if (v) out[k] = v;
    });
    return out;
  },
  isNonCritical: (messageCode: MessageCodes) => {
    return !criticalErrors.some((s) => s == messageCode);
  },
};

const criticalErrors = [
  MessageCodes.CANCELLED,
  MessageCodes.WRONGAPPLICATIONSTATE,
  MessageCodes.OUTOFSEQUENCE,
  MessageCodes.TIMEOUT,
  MessageCodes.SESSIONTIMEOUT,
  MessageCodes.KILLTIMEOUT,
  MessageCodes.SOFTWAREERROR,
  MessageCodes.CRITICALSOFTWAREERROR,
  MessageCodes.FORMATERROR,
  MessageCodes.LENGTHERROR,
  MessageCodes.DATAMISSING,
  MessageCodes.THRESHOLDERROR,
  MessageCodes.THRESHOLDUSAGE,
  MessageCodes.HARDWAREERROR,
  MessageCodes.NOTREACHABLE,
  MessageCodes.NOTRESPONDING,
  MessageCodes.BAGGAGEFULL,
  MessageCodes.BAGGAGEUNDETECTED,
  MessageCodes.BAGGAGEOVERSIZED,
  MessageCodes.BAGGAGETOOMANYBAGS,
  MessageCodes.BAGGAGEUNEXPECTEDBAG,
  MessageCodes.BAGGAGETOOHIGH,
  MessageCodes.BAGGAGETOOLONG,
  MessageCodes.BAGGAGETOOFLAT,
  MessageCodes.BAGGAGETOOSHORT,
  MessageCodes.BAGGAGEINVALIDDATA,
  MessageCodes.BAGGAGEWEIGHTOUTOFRANGE,
  MessageCodes.BAGGAGEJAMMED,
  MessageCodes.BAGGAGEEMERGENCYSTOP,
  MessageCodes.BAGGAGERESTLESS,
  MessageCodes.BAGGAGETRANSPORTBUSY,
  MessageCodes.BAGGAGEMISTRACKED,
  MessageCodes.BAGGAGEUNEXPECTEDCHANGE,
  MessageCodes.BAGGAGEINTERFERENCEUSER,
  MessageCodes.BAGGAGEINTRUSIONSAFETY,
  MessageCodes.BAGGAGENOTCONVEYABLE,
  MessageCodes.BAGGAGEIRREGULARBAG,
  MessageCodes.BAGGAGEVOLUMENOTDETERMINABLE,
  MessageCodes.BAGGAGEOVERFLOWTUB,
];

const isDataRecord = (dataRecordObject: unknown): dataRecordObject is DataRecordList => {
  return Array.isArray(dataRecordObject) && dataRecordObject.length > 0 && 'data' in dataRecordObject[0];
};

interface BuildOptions {
  componentID?: string;
  deviceID?: string;
  dataObj?: ApplicationState | ApplicationTransfer | DataRecordList | ScreenResolution
		| CUSS2IlluminationDomainIlluminationData | BaggageData | CommonUsePaymentMessage
		| CUSS2BiometricsDomainCommonUseBiometricMessage;
}

export const Build = {
  applicationData: (
    directive: PlatformDirectives,
    options: BuildOptions = {},
  ) => {
    const {
      componentID,
      deviceID = "00000000-0000-0000-0000-000000000000",
      dataObj,
    } = options;
    const meta = {} as ApplicationDataMeta;
    meta.requestID = crypto.randomUUID();
    meta.directive = directive;
    meta.componentID = componentID;
    meta.deviceID = deviceID;

    const payload = {} as ApplicationDataPayload;

    if (dataObj && "applicationStateCode" in dataObj)
			payload.applicationState = dataObj;

    if (dataObj && "targetApplicationID" in dataObj)
			payload.applicationTransfer = dataObj;

    if (isDataRecord(dataObj))
			payload.dataRecords = dataObj;

    if (dataObj && "vertical" in dataObj)
      payload.screenResolution = dataObj;

    if (dataObj && "lightColor" in dataObj)
			payload.illuminationData = dataObj;

    if (dataObj && "baggageMeasurements" in dataObj)
			payload.bagdropData = dataObj;

    if (dataObj && "ePaymentMessage" in dataObj)
			payload.paymentData = dataObj;

    if (dataObj && "biometricProviderMessage" in dataObj)
			payload.biometricData = dataObj;

    return { meta, payload } as ApplicationData;
  },

  stateChange: (
    desiredState: string | number,
    reasonCode: string | number,
    reason: string,
    brand: string | undefined = undefined,
  ) => {
    return Build.applicationData(
      PlatformDirectives.PlatformApplicationsStaterequest,
      {
        dataObj: {
          applicationStateCode: desiredState,
          applicationStateChangeReasonCode: reasonCode,
          applicationStateChangeReason: reason,
          applicationBrand: brand,
        } as ApplicationState,
      },
    );
  },
};
