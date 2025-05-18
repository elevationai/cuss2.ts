import { ComponentState, MessageCodes, PlatformData, UniqueID } from "cuss2-typescript-models";

export class PlatformResponseError extends Error {
  constructor(pd: PlatformData) {
    super("Platform returned status code: " + pd.meta.messageCode);
    this.componentID = pd.meta.componentID as number;
    this.componentState = pd.meta.componentState;
    this.requestID = pd.meta.requestID;
    this.messageCode = pd.meta.messageCode || MessageCodes.SOFTWAREERROR;
  }
  componentID?: number;
  componentState: ComponentState | undefined;
  requestID: UniqueID;
  messageCode: MessageCodes;
}
