import {
  ApplicationStateChangeReasonCodes,
  ApplicationStateCodes,
  BaggageData,
  CommonUsePaymentMessage,
  ComponentList,
  CUSS2BiometricsDomainCommonUseBiometricMessage,
  CUSS2IlluminationDomainIlluminationData,
  DataRecordList,
  EnvironmentLevel,
  PlatformData,
  ScreenResolution,
} from "cuss2-typescript-models";

/**
 * Interface defining the API methods available for interacting with CUSS2 components
 */
export interface ComponentAPI {
  /**
   * Gets environment information from the CUSS2 platform
   */
  getEnvironment: () => Promise<EnvironmentLevel>;

  /**
   * Gets the list of available components from the CUSS2 platform
   */
  getComponents: () => Promise<ComponentList>;

  /**
   * Enable a component for user interaction
   */
  enable: (componentID: number) => Promise<PlatformData>;

  /**
   * Disable a component from user interaction
   */
  disable: (componentID: number) => Promise<PlatformData>;

  /**
   * Cancel the current operation on a component
   */
  cancel: (componentID: number) => Promise<PlatformData>;

  /**
   * Query the status of a component
   */
  getStatus: (componentID: number) => Promise<PlatformData>;

  /**
   * Configure a component with setup data
   */
  setup: (componentID: number, dataObj: DataRecordList) => Promise<PlatformData>;

  /**
   * Send data to a component
   */
  send: (
    componentID: number,
    dataObj:
      | DataRecordList
      | ScreenResolution
      | CUSS2IlluminationDomainIlluminationData
      | BaggageData
      | CommonUsePaymentMessage
      | CUSS2BiometricsDomainCommonUseBiometricMessage,
  ) => Promise<PlatformData>;

  /**
   * Offer a component to the user
   */
  offer: (componentID: number) => Promise<PlatformData>;

  /**
   * Request a state change for the application
   */
  staterequest: (
    state: ApplicationStateCodes,
    reasonCode?: ApplicationStateChangeReasonCodes,
    reason?: string,
  ) => Promise<PlatformData | undefined>;

  /**
   * Announcement-specific operations
   */
  announcement: {
    /**
     * Play an announcement
     */
    play: (componentID: number, rawData: string) => Promise<PlatformData>;

    /**
     * Stop an announcement
     */
    stop: (componentID: number) => Promise<PlatformData>;

    /**
     * Pause an announcement
     */
    pause: (componentID: number) => Promise<PlatformData>;

    /**
     * Resume a paused announcement
     */
    resume: (componentID: number) => Promise<PlatformData>;
  };
}
