import { EventEmitter } from 'node:events';
import * as uuid from "uuid";
import {
  ApplicationData,
  ApplicationDataMeta,
  MessageCodes,
  PlatformDirectives,
  ApplicationDataPayload
} from "cuss2-typescript-models";


export class LogMessage {
  action: string;
  data: any;
  level: string;

  constructor(level:string, action:string, data:any) {
    this.action = action;
    this.level = level;
    this.data = data;
  }
}
export class Logger extends EventEmitter {}

export const logger = new Logger();
export const log = (level:string, action:string, data?:any) => {
  logger.emit("log", new LogMessage(level, action, data));
};

export const helpers = {
  splitAndFilter: (text:string, delimiter1='#') : string[] => {
    return text.split(delimiter1).filter(p => !!p);
  },
  split_every: (text:string, n:number):string[] => {
    return text.match(new RegExp('.{1,'+n+'}','g')) as string[];
  },
  deserializeDictionary: (text:string, delimiter1='#', delimiter2='=') : object => {
    const out:any = {};
    helpers.splitAndFilter(text, delimiter1).forEach(p => {
      const [ k,v ] = p.split(delimiter2);
      if (v) out[k] = v;
    });
    return out;
  },
  /**
   * Uses criticalErrors list to determine if an error is critical or not.
   */
  isNonCritical: (messageCode:MessageCodes) => {
    return !criticalErrors.some(s => s == messageCode)
  }
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
  MessageCodes.BAGGAGEOVERFLOWTUB
]

const isDataRecord = (dataRecordObject: any) => {
  if ( Array.isArray(dataRecordObject) && dataRecordObject.length > 0 ) {
    const first = dataRecordObject[0];
    if (first.hasOwnProperty('data')) {
      return true;
    }

  }
  return false;
}

export const Build = {
  applicationData: (directive: PlatformDirectives, options: any = {}) => {
    // @ts-ignore
    const {componentID, token, deviceID = "00000000-0000-0000-0000-000000000000", dataObj} = options
    const meta = {} as ApplicationDataMeta
    meta.requestID = uuid.v4()
    meta.oauthToken = token
    meta.directive = directive
    meta.componentID = componentID
    meta.deviceID = deviceID

    const payload = {
      applicationState: null,
      applicationTransfer: null,
      dataRecords: [],
      screenResolution: null,
      illuminationData: null,
      bagdropData: null,
      paymentData: null,
      biometricData: null
    } as ApplicationDataPayload
    if(dataObj?.hasOwnProperty('applicationStateCode')) { payload.applicationState = dataObj }
    if(dataObj?.hasOwnProperty('targetApplicationID')) { payload.applicationTransfer = dataObj }
    if(isDataRecord(dataObj)) { payload.dataRecords = dataObj }
    if(dataObj?.hasOwnProperty('verticak')) { payload.screenResolution = dataObj }
    if(dataObj?.hasOwnProperty('lightColor')) { payload.illuminationData = dataObj }
    if(dataObj?.hasOwnProperty('baggageMeasurements')) { payload.bagdropData = dataObj }
    if(dataObj?.hasOwnProperty('ePaymentMessage')) { payload.paymentData = dataObj }
    if(dataObj?.hasOwnProperty('biometricProviderMessage')) { payload.biometricData = dataObj }

    const ad = {} as ApplicationData
    ad.meta = meta
    ad.payload = payload
    return ad
  },
  stateChange: (desiredState: any, reasonCode: any, reason: any, brand=undefined) => {
    return Build.applicationData(PlatformDirectives.PlatformApplicationsStaterequest, {
      dataObj: {
        applicationStateCode: desiredState,
        applicationStateChangeReasonCode: reasonCode,
        applicationStateChangeReason: reason,
        applicationBrand: brand
      }
    })
  }
}
