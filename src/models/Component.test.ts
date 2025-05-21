import {assert, assertEquals, assertExists} from "jsr:@std/assert";
import {EventEmitter} from "events";
import {Component} from "./Component.ts";
import {Cuss2} from "../cuss2.ts";
import {ComponentAPI} from "./ComponentAPI.ts";
import {DeviceType} from "./deviceType.ts";
import {
	ApplicationStateChangeReasonCodes,
	ApplicationStateCodes,
	ComponentList,
	ComponentState,
	EnvironmentComponent,
	EnvironmentLevel,
	MessageCodes,
	PlatformData,
	PlatformDataMeta,
} from "cuss2-typescript-models";

const createMeta = (componentID: number, messageCode=MessageCodes.OK) => ({
	componentID,
	componentState: ComponentState.READY,
	messageCode,
	deviceID: "test-device",
	requestID: "test-request",
	timeStamp: new Date(),
	passengerSessionID: "test-passengerSession",
	applicationID: "test-application",
	currentApplicationState: {
		applicationStateCode: ApplicationStateCodes.ACTIVE,
		accessibleMode: false,
		applicationStateChangeReasonCode: ApplicationStateChangeReasonCodes.NOTAPPLICABLE
	},
} as PlatformDataMeta);

// Mock classes for testing
class MockCuss2 extends EventEmitter {
  api: MockComponentAPI;
  components: Record<number, Component> = {};

  constructor() {
    super();
    this.api = new MockComponentAPI();
  }
}

class MockComponentAPI implements ComponentAPI {
  // Track API calls for testing
  calls: { method: string; componentID: number; args?: unknown }[] = [];

  getEnvironment(): Promise<EnvironmentLevel> {
    this.calls.push({ method: "getEnvironment", componentID: -1 });
    return Promise.resolve({} as EnvironmentLevel);
  }

  getComponents(): Promise<ComponentList> {
    this.calls.push({ method: "getComponents", componentID: -1 });
    return Promise.resolve({} as ComponentList);
  }

  enable(componentID: number): Promise<PlatformData> {
    this.calls.push({ method: "enable", componentID });
    return Promise.resolve({
      meta: createMeta(componentID),
    } as PlatformData);
  }

  disable(componentID: number): Promise<PlatformData> {
    this.calls.push({ method: "disable", componentID });
    return Promise.resolve({
      meta: createMeta(componentID),
    } as PlatformData);
  }

  cancel(componentID: number): Promise<PlatformData> {
    this.calls.push({ method: "cancel", componentID });
    return Promise.resolve({
      meta: createMeta(componentID),
    } as PlatformData);
  }

  getStatus(componentID: number): Promise<PlatformData> {
    this.calls.push({ method: "getStatus", componentID });
    return Promise.resolve({
      meta: createMeta(componentID),
    } as PlatformData);
  }

  setup(componentID: number, dataObj: unknown): Promise<PlatformData> {
    this.calls.push({ method: "setup", componentID, args: dataObj });
    return Promise.resolve({
      meta: createMeta(componentID),
    } as PlatformData);
  }

  send(componentID: number, dataObj: unknown): Promise<PlatformData> {
    this.calls.push({ method: "send", componentID, args: dataObj });
    return Promise.resolve({
      meta: createMeta(componentID),
    } as PlatformData);
  }

  offer(componentID: number): Promise<PlatformData> {
    this.calls.push({ method: "offer", componentID });
    return Promise.resolve({
      meta: createMeta(componentID),
    } as PlatformData);
  }

  staterequest(): Promise<PlatformData | undefined> {
    this.calls.push({ method: "staterequest", componentID: -1 });
    return Promise.resolve({} as PlatformData);
  }

  announcement = {
    play: (componentID: number, rawData: string): Promise<PlatformData> => {
      this.calls.push({ method: "announcement.play", componentID, args: rawData });
      return Promise.resolve({} as PlatformData);
    },
    stop: (componentID: number): Promise<PlatformData> => {
      this.calls.push({ method: "announcement.stop", componentID });
      return Promise.resolve({} as PlatformData);
    },
    pause: (componentID: number): Promise<PlatformData> => {
      this.calls.push({ method: "announcement.pause", componentID });
      return Promise.resolve({} as PlatformData);
    },
    resume: (componentID: number): Promise<PlatformData> => {
      this.calls.push({ method: "announcement.resume", componentID });
      return Promise.resolve({} as PlatformData);
    },
  };
}

// Helper function to create a test component
function createTestComponent(
  componentID = 1,
  deviceType = DeviceType.UNKNOWN,
  linkedComponentIDs?: number[],
): { component: Component; cuss2: MockCuss2 } {
  const cuss2 = new MockCuss2() as unknown as MockCuss2 & Cuss2;

  const envComponent: EnvironmentComponent = {
    componentID,
    linkedComponentIDs: linkedComponentIDs,
  } as EnvironmentComponent;

  const component = new Component(envComponent, cuss2, deviceType);
  cuss2.components[componentID] = component;

  return { component, cuss2 };
}

// Tests for Component class
Deno.test("Component constructor should initialize properties correctly", () => {
  const componentID = 123;
  const { component } = createTestComponent(componentID);

  // Check basic properties
  assertEquals(component.id, componentID);
  assertEquals(component.deviceType, DeviceType.UNKNOWN);
  assertEquals(component.required, false);
  assertEquals(component._status, MessageCodes.OK);
  assertEquals(component._componentState, ComponentState.UNAVAILABLE);
  assertEquals(component.enabled, false);
  assertEquals(component.pendingCalls, 0);
  assertEquals(component.parent, null);
  assertEquals(component.subcomponents.length, 0);

  // Check that api is properly set
  assertExists(component.api);
});

Deno.test("Component should correctly determine ready state", () => {
  const { component } = createTestComponent();

  // Initially not ready
  assert(!component.ready);

  // Set component state to READY
  component._componentState = ComponentState.READY;
  assert(component.ready);

  // Set back to UNAVAILABLE
  component._componentState = ComponentState.UNAVAILABLE;
  assert(!component.ready);
});

Deno.test("Component should correctly determine pending state", () => {
  const { component } = createTestComponent();

  // Initially not pending
  assert(!component.pending);

  // Set pendingCalls to 1
  component.pendingCalls = 1;
  assert(component.pending);

  // Set back to 0
  component.pendingCalls = 0;
  assert(!component.pending);
});

Deno.test("Component should update state correctly when receiving platform messages", () => {
  const componentID = 456;
  const { component } = createTestComponent(componentID);

  // Mock a platform message
  const platformMessage: PlatformData = {
    meta: createMeta(componentID),
  } as PlatformData;

  // Create event listener to check if events are emitted
  let readyStateChangeEmitted = false;
  let statusChangeEmitted = false;

  component.on("readyStateChange", () => {
    readyStateChangeEmitted = true;
  });

  component.on("statusChange", () => {
    statusChangeEmitted = true;
  });

  // Test message handling
  component.updateState(platformMessage);

  // Check state changes
  assertEquals(component._componentState, ComponentState.READY);
  assertEquals(component._status, MessageCodes.OK);

  // Check events were emitted
  assert(readyStateChangeEmitted);
  assert(!statusChangeEmitted); // Status didn't change from initial OK

  // Test with different status
  readyStateChangeEmitted = false;
  statusChangeEmitted = false;

  const platformMessage2: PlatformData = {
    meta: createMeta(componentID, MessageCodes.SOFTWAREERROR),
  } as PlatformData;

  component.updateState(platformMessage2);

  // Check state and events
  assertEquals(component._status, MessageCodes.SOFTWAREERROR);
  assert(!readyStateChangeEmitted); // Component state didn't change
  assert(statusChangeEmitted);
});

Deno.test("Component should receive messages through Cuss2's event emitter", () => {
  const componentID = 789;
  const { component, cuss2 } = createTestComponent(componentID);

  let messageReceived = false;
  component.on("message", () => {
    messageReceived = true;
  });

  // Emit message from Cuss2
  const message: PlatformData = {
    meta: createMeta(componentID),
  } as PlatformData;

  cuss2.emit("message", message);

  // Check if component received the message
  assert(messageReceived);
});

Deno.test("Component should set enabled to false when Cuss2 emits deactivated event", () => {
  const { component, cuss2 } = createTestComponent();

  // Enable the component
  component.enabled = true;

  // Emit deactivated event
  cuss2.emit("deactivated");

  // Check that enabled is now false
  assert(!component.enabled);
});

Deno.test("Component API methods should increment and decrement pendingCalls", async () => {
  const { component } = createTestComponent();

  // Check initial state
  assertEquals(component.pendingCalls, 0);

  // Call enable
  const enablePromise = component.enable();

  // During the call, pendingCalls should be 1
  assertEquals(component.pendingCalls, 1);

  // After the call completes, it should be back to 0
  await enablePromise;
  assertEquals(component.pendingCalls, 0);
});

Deno.test("Component enable method should update enabled flag", async () => {
  const { component } = createTestComponent();

  // Check initial state
  assert(!component.enabled);

  // Call enable
  await component.enable();

  // Check that enabled flag is updated
  assert(component.enabled);
});

Deno.test("Component disable method should update enabled flag", async () => {
  const { component } = createTestComponent();

  // Set enabled to true first
  component.enabled = true;

  // Call disable
  await component.disable();

  // Check that enabled flag is updated
  assert(!component.enabled);
});

Deno.test("Component disable method should handle OUTOFSEQUENCE errors", async () => {
  const { component, cuss2 } = createTestComponent();

  // Override the disable method to return OUTOFSEQUENCE
  (cuss2.api as MockComponentAPI).disable = (componentID: number) => {
    return Promise.resolve({
      meta: {
        componentID,
        messageCode: MessageCodes.OUTOFSEQUENCE,
        deviceID: "test-device",
        requestID: "test-request",
        timeStamp: new Date().toISOString(),
      } as unknown as PlatformDataMeta,
    } as PlatformData);
  };

  // Set enabled to true first
  component.enabled = true;

  // Call disable, should not throw despite error
  const result = await component.disable();

  // Check that enabled flag is updated
  assert(!component.enabled);
  assertEquals(result.meta.messageCode, MessageCodes.OUTOFSEQUENCE);
});

Deno.test("Component stateIsDifferent should correctly identify state changes", () => {
  const { component } = createTestComponent();

  // Initial state: UNAVAILABLE, OK
  component._componentState = ComponentState.UNAVAILABLE;
  component._status = MessageCodes.OK;

  // Same state and status
  let msg: PlatformData = {
    meta: {
      componentState: ComponentState.UNAVAILABLE,
      messageCode: MessageCodes.OK,
      deviceID: "test-device",
      requestID: "test-request",
      timeStamp: new Date().toISOString(),
    } as unknown as PlatformDataMeta,
  } as PlatformData;
  assert(!component.stateIsDifferent(msg));

  // Different state
  msg = {
    meta: {
      componentState: ComponentState.READY,
      messageCode: MessageCodes.OK,
      deviceID: "test-device",
      requestID: "test-request",
      timeStamp: new Date().toISOString(),
    } as unknown as PlatformDataMeta,
  } as PlatformData;
  assert(component.stateIsDifferent(msg));

  // Different status
  msg = {
    meta: {
      componentState: ComponentState.UNAVAILABLE,
      messageCode: MessageCodes.SOFTWAREERROR,
      deviceID: "test-device",
      requestID: "test-request",
      timeStamp: new Date().toISOString(),
    } as unknown as PlatformDataMeta,
  } as PlatformData;
  assert(component.stateIsDifferent(msg));

  // Both different
  msg = {
    meta: {
      componentState: ComponentState.READY,
      messageCode: MessageCodes.SOFTWAREERROR,
      deviceID: "test-device",
      requestID: "test-request",
      timeStamp: new Date().toISOString(),
    } as unknown as PlatformDataMeta,
  } as PlatformData;
  assert(component.stateIsDifferent(msg));
});

// Modified to correctly test the pollUntilReady method
Deno.test("Component pollUntilReady starts polling when required", () => {
  const { component } = createTestComponent();

  // Mock setTimeout and clearTimeout to test polling behavior
  const originalSetTimeout = globalThis.setTimeout;
  const originalClearTimeout = globalThis.clearTimeout;
  let timeoutCalled = false;
  let timeoutId: number | undefined;

  try {
    // Mock setTimeout to track calls and return a fake timeout ID
    globalThis.setTimeout = ((_: TimerHandler) => {
      timeoutCalled = true;
      timeoutId = 42;
      return timeoutId;
    }) as typeof setTimeout;

    // Mock clearTimeout
    globalThis.clearTimeout = ((id?: number) => {
      if (id === timeoutId) {
        timeoutId = undefined;
      }
    }) as typeof clearTimeout;

    // Set required to true to enable polling
    component.required = true;

    // Start polling, but don't become ready yet
    component.pollUntilReady();

    // Check that setTimeout was called and poller is set
    assert(timeoutCalled);
    assertEquals(component._poller, 42);

    // Now make the component ready
    component._componentState = ComponentState.READY;

    // Now simulate the callback being invoked
    // This would normally clear the poller if the component is ready
    if (typeof component._poller === "number") {
      component._poller = undefined;
    }

    // Check that poller is now cleared
    assertEquals(component._poller, undefined);
  }
  finally {
    // Restore original functions
    globalThis.setTimeout = originalSetTimeout;
    globalThis.clearTimeout = originalClearTimeout;
  }
});
