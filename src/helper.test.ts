import { assertEquals, assertExists, assertInstanceOf } from "https://deno.land/std/testing/asserts.ts";
import { spy } from "https://deno.land/std/testing/mock.ts";
import {
  LogMessage,
  log,
  logger,
  helpers,
  Build
} from "./helper.ts";
import {
  MessageCodes,
  PlatformDirectives,
  ApplicationStateCodes,
  ApplicationStateChangeReasonCodes, 
  ApplicationTransfer
} from "cuss2-typescript-models";
import { ApplicationState } from "cuss2-typescript-models";

Deno.test("LogMessage class should initialize with correct properties", () => {
  const logMessage = new LogMessage("info", "test", { foo: "bar" });
  assertEquals(logMessage.level, "info");
  assertEquals(logMessage.action, "test");
  assertEquals(logMessage.data, { foo: "bar" });
});

Deno.test("log function should emit log event with LogMessage", () => {
  // Instead of replacing the emit method, we'll spy on the event emitter
  let capturedEvent: unknown;
  let capturedData: unknown;
  
  // We'll just add a listener without messing with existing ones
  let emitted = false;
  
  const listener = (data: unknown) => {
    emitted = true;
    capturedEvent = "log";
    capturedData = data;
  };
  
  logger.on("log", listener);
  
  try {
    // Call the log function
    log("debug", "testAction", { test: "data" });
    
    // Verify event was emitted with correct parameters
    assertEquals(emitted, true);
    assertEquals(capturedEvent, "log");
    assertInstanceOf(capturedData as LogMessage, LogMessage);
    
    const logMessage = capturedData as LogMessage;
    assertEquals(logMessage.level, "debug");
    assertEquals(logMessage.action, "testAction");
    assertEquals(logMessage.data, { test: "data" });
  } finally {
    // Remove our listener
    logger.off("log", listener);
  }
});

Deno.test("helpers.splitAndFilter should split string by delimiter and filter empty parts", () => {
  assertEquals(helpers.splitAndFilter("a#b#c"), ["a", "b", "c"]);
  assertEquals(helpers.splitAndFilter("a##c"), ["a", "c"]);
  assertEquals(helpers.splitAndFilter("##"), []);
  assertEquals(helpers.splitAndFilter(""), []);
  assertEquals(helpers.splitAndFilter("a,b,c", ","), ["a", "b", "c"]);
});

Deno.test("helpers.split_every should split string into chunks of specified size", () => {
  assertEquals(helpers.split_every("abcdef", 2), ["ab", "cd", "ef"]);
  assertEquals(helpers.split_every("abcde", 2), ["ab", "cd", "e"]);
  assertEquals(helpers.split_every("", 3), []);
  assertEquals(helpers.split_every("a", 3), ["a"]);
});

Deno.test("helpers.deserializeDictionary should convert delimited string to key-value object", () => {
  assertEquals(
    helpers.deserializeDictionary("key1=value1#key2=value2"),
    { key1: "value1", key2: "value2" }
  );
  assertEquals(
    helpers.deserializeDictionary("key1=value1#invalidentry#key2=value2"),
    { key1: "value1", key2: "value2" }
  );
  assertEquals(
    helpers.deserializeDictionary("key=value|another=test", "|", "="),
    { key: "value", another: "test" }
  );
  assertEquals(helpers.deserializeDictionary(""), {});
});

Deno.test("helpers.isNonCritical should identify critical and non-critical message codes", () => {
  // Test some critical errors
  assertEquals(helpers.isNonCritical(MessageCodes.CANCELLED), false);
  assertEquals(helpers.isNonCritical(MessageCodes.TIMEOUT), false);
  assertEquals(helpers.isNonCritical(MessageCodes.HARDWAREERROR), false);

  // Test non-critical errors (assuming OK is a non-critical message code)
  assertEquals(helpers.isNonCritical(MessageCodes.OK), true);
});

Deno.test("Build.applicationData should build correct structure for ApplicationState", () => {
  const applicationState = {
    applicationStateCode: ApplicationStateCodes.AVAILABLE,
    applicationStateChangeReasonCode: ApplicationStateChangeReasonCodes.NOTAPPLICABLE,
    applicationStateChangeReason: "test reason",
    applicationBrand: "test brand"
  } as ApplicationState;

  const result = Build.applicationData(
    PlatformDirectives.PlatformApplicationsStaterequest,
    { dataObj: applicationState }
  );

  // Check meta properties
  assertEquals(result.meta.directive, PlatformDirectives.PlatformApplicationsStaterequest);
  assertExists(result.meta.requestID);
  assertEquals(result.meta.deviceID, "00000000-0000-0000-0000-000000000000");

  // Check payload
  if (result.payload) {
    assertEquals(result.payload.applicationState, applicationState);
  }
});

Deno.test("Build.applicationData should build correct structure for ApplicationTransfer", () => {
  const applicationTransfer = {
    targetApplicationID: "target-app-id",
    restartCurrent: true,
    languageID: "en-US",
  } as ApplicationTransfer;

  const result = Build.applicationData(
    PlatformDirectives.PlatformApplicationsTransferrequest,
    {
      dataObj: applicationTransfer,
      componentID: "comp-123",
      deviceID: "device-456"
    }
  );

  // Check meta properties
  assertEquals(result.meta.directive, PlatformDirectives.PlatformApplicationsTransferrequest);
  assertEquals(result.meta.componentID, "comp-123");
  assertEquals(result.meta.deviceID, "device-456");

  // Check payload
  if (result.payload) {
    assertEquals(result.payload.applicationTransfer, applicationTransfer);
  }
});

Deno.test("Build.stateChange should build correct state change request", () => {
  const result = Build.stateChange(
    ApplicationStateCodes.ACTIVE,
    ApplicationStateChangeReasonCodes.NOTAPPLICABLE,
    "Test reason",
    "Test brand"
  );

  // Check meta
  assertEquals(result.meta.directive, PlatformDirectives.PlatformApplicationsStaterequest);

  // Check payload
  if (result.payload && result.payload.applicationState) {
    assertEquals(result.payload.applicationState.applicationStateCode, ApplicationStateCodes.ACTIVE);
    assertEquals(result.payload.applicationState.applicationStateChangeReasonCode, ApplicationStateChangeReasonCodes.NOTAPPLICABLE);
    assertEquals(result.payload.applicationState.applicationStateChangeReason, "Test reason");
    assertEquals(result.payload.applicationState.applicationBrand, "Test brand");
  }
});

Deno.test("Build.stateChange should work without brand", () => {
  const result = Build.stateChange(
    ApplicationStateCodes.INITIALIZE,
    ApplicationStateChangeReasonCodes.NOTAPPLICABLE,
    "Another reason"
  );

  // Check payload
  if (result.payload && result.payload.applicationState) {
    assertEquals(result.payload.applicationState.applicationStateCode, ApplicationStateCodes.INITIALIZE);
    assertEquals(result.payload.applicationState.applicationStateChangeReasonCode, ApplicationStateChangeReasonCodes.NOTAPPLICABLE);
    assertEquals(result.payload.applicationState.applicationStateChangeReason, "Another reason");
    assertEquals(result.payload.applicationState.applicationBrand, undefined);
  }
});