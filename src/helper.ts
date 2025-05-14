import { EventEmitter } from "node:events";
import * as uuid from "uuid";
import {
  ApplicationData,
  ApplicationDataMeta,
  ApplicationDataPayload,
  MessageCodes,
  PlatformDirectives,
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
export class Logger extends EventEmitter {}

export const logger = new Logger();
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

interface DataRecordItem {
  data: unknown;
  [key: string]: unknown;
}

const isDataRecord = (dataRecordObject: unknown): boolean => {
  if (Array.isArray(dataRecordObject) && dataRecordObject.length > 0) {
    const first = dataRecordObject[0] as Record<string, unknown>;
    if (Object.prototype.hasOwnProperty.call(first, "data")) {
      return true;
    }
  }
  return false;
};

interface ApplicationDataOptions {
  componentID?: string;
  token?: string;
  deviceID?: string;
  dataObj?: Record<string, unknown>;
}

export const Build = {
  applicationData: (
    directive: PlatformDirectives,
    options: ApplicationDataOptions = {},
  ) => {
    const {
      componentID,
      token,
      deviceID = "00000000-0000-0000-0000-000000000000",
      dataObj,
    } = options;
    const meta = {} as ApplicationDataMeta;
    meta.requestID = uuid.v4();
    meta.oauthToken = token;
    meta.directive = directive;
    meta.componentID = componentID;
    meta.deviceID = deviceID;

    const payload = {
      applicationState: null,
      applicationTransfer: null,
      dataRecords: [],
      screenResolution: null,
      illuminationData: null,
      bagdropData: null,
      paymentData: null,
      biometricData: null,
    } as ApplicationDataPayload;

    if (
      dataObj &&
      Object.prototype.hasOwnProperty.call(dataObj, "applicationStateCode")
    ) payload.applicationState = dataObj;
    if (
      dataObj &&
      Object.prototype.hasOwnProperty.call(dataObj, "targetApplicationID")
    ) payload.applicationTransfer = dataObj;
    if (isDataRecord(dataObj)) payload.dataRecords = dataObj as unknown[];
    if (dataObj && Object.prototype.hasOwnProperty.call(dataObj, "verticak")) {
      payload.screenResolution = dataObj;
    }
    if (
      dataObj && Object.prototype.hasOwnProperty.call(dataObj, "lightColor")
    ) payload.illuminationData = dataObj;
    if (
      dataObj &&
      Object.prototype.hasOwnProperty.call(dataObj, "baggageMeasurements")
    ) payload.bagdropData = dataObj;
    if (
      dataObj &&
      Object.prototype.hasOwnProperty.call(dataObj, "ePaymentMessage")
    ) payload.paymentData = dataObj;
    if (
      dataObj &&
      Object.prototype.hasOwnProperty.call(dataObj, "biometricProviderMessage")
    ) payload.biometricData = dataObj;

    const ad = {} as ApplicationData;
    ad.meta = meta;
    ad.payload = payload;
    return ad;
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
        },
      },
    );
  },
};