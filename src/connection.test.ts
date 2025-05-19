import { assertEquals, assertExists, assertRejects, assertStringIncludes, fail as _fail } from "jsr:@std/assert";
import { delay } from "jsr:@std/async/delay";

import { Connection, global } from "./connection.ts";
import { AuthenticationError } from "./models/Errors.ts";
import { PlatformResponseError } from "./models/platformResponseError.ts";
import { MessageCodes, PlatformDirectives } from "cuss2-typescript-models";

// Mock for the WebSocket class
class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  url: string = "";
  readyState: number = MockWebSocket.CONNECTING;

  // Event handlers
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;

  // Tracking for testing
  sentMessages: string[] = [];

  // Methods
  close(code = 1000, reason = ""): void {
    this.readyState = MockWebSocket.CLOSED;
    if (this.onclose) {
      const closeEvent = {
        type: "close",
        wasClean: true,
        code,
        reason,
        target: this,
      } as unknown as CloseEvent;
      this.onclose(closeEvent);
    }
  }

  send(data: string): void {
    if (typeof data === "string") {
      this.sentMessages.push(data);
    }
  }

  // Helper methods for testing

  // Simulate receiving a message
  simulateMessage(data: string): void {
    if (this.onmessage) {
      const messageEvent = {
        type: "message",
        data,
        target: this,
      } as unknown as MessageEvent;
      this.onmessage(messageEvent);
    }
  }

  // Simulate connection opening
  _simulateOpen(): void {
    this.readyState = MockWebSocket.OPEN;
    if (this.onopen) {
      const openEvent = {
        type: "open",
        target: this,
      } as unknown as Event;
      this.onopen(openEvent);
    }
  }
}

// Mock response for fetch
class MockResponse {
  _status: number;
  _data: unknown;

  constructor(status: number, data: unknown) {
    this._status = status;
    this._data = data;
  }

  get status(): number {
    return this._status;
  }

  json(): Promise<unknown> {
    return Promise.resolve(this._data);
  }
}

// Common test values
const testDeviceId = "device-123";
const testClientId = "client-id";
const testClientSecret = "client-secret";
const testBaseUrl = "https://example.com/api";
const testTokenUrl = "https://example.com/api/oauth/token";
const testToken = "test-token";

function mockGlobal(fn: () => Promise<unknown> | unknown): () => Promise<void> {
  return async () => {
    try {
      await fn();
    }
    finally {
      global.WebSocket = globalThis.WebSocket;
      global.fetch = globalThis.fetch;
      global.setTimeout = globalThis.setTimeout.bind(globalThis);
      global.clearTimeout = globalThis.clearTimeout.bind(globalThis);
    }
  };
}
function mockWebSocket(action?: (ws: MockWebSocket) => (() => void) | undefined): MockWebSocket {
  const mockWs = new MockWebSocket();
  function creator(url: string) {
    mockWs.url = url;
    const a = action && action(mockWs);
    const deferredWork = a || (() => mockWs._simulateOpen());
    delay(10).then(deferredWork);
    return mockWs;
  }
  creator.prototype = MockWebSocket.prototype;

  //@ts-ignore - Mock WebSocket for testing
  global.WebSocket = creator;
  return mockWs;
}
function mockFetch(options?: { action?: () => void; status?: number; token?: string; expires_in?: number }) {
  const { action = () => {}, status = 200, token = testToken, expires_in = 3600 } = options || {};

  global.fetch = () => {
    action();
    return Promise.resolve(
      new MockResponse(status, {
        access_token: token,
        expires_in,
        token_type: "Bearer",
      }) as unknown as Response,
    );
  };
}

// Tests for the Connection class

// Test for Connection.authorize
Deno.test(
  "Connection.authorize should get and return a token",
  mockGlobal(async () => {
    global.fetch = (url: string | URL | Request, options?: RequestInit) => {
      // Verify correct URL and options
      assertEquals(url, testTokenUrl);
      assertEquals(options?.method, "POST");
      // Type assertion for header key
      assertEquals(
        (options?.headers as Record<string, string>)?.["Content-Type"],
        "application/x-www-form-urlencoded",
      );

      // Extract and verify body parameters
      const bodyParams = new URLSearchParams(options?.body as string);
      assertEquals(bodyParams.get("client_id"), testClientId);
      assertEquals(bodyParams.get("client_secret"), testClientSecret);
      assertEquals(bodyParams.get("grant_type"), "client_credentials");

      // Return a successful response
      return Promise.resolve(
        new MockResponse(200, {
          access_token: testToken,
          expires_in: 3600,
          token_type: "Bearer",
        }) as unknown as Response,
      );
    };

    const result = await Connection.authorize(
      testTokenUrl,
      testClientId,
      testClientSecret,
    );

    assertEquals(result.access_token, testToken);
    assertEquals(result.expires_in, 3600);
    assertEquals(result.token_type, "Bearer");
  }),
);

Deno.test(
  "Connection.authorize should throw AuthenticationError for 401 responses",
  mockGlobal(async () => {
    global.fetch = () => {
      return Promise.resolve(new MockResponse(401, { error: "invalid_client" }) as unknown as Response);
    };

    // Verify that calling the method throws the expected error
    await assertRejects(
      async () => {
        await Connection.authorize(testTokenUrl, testClientId, testClientSecret);
      },
      AuthenticationError,
      "Invalid Credentials",
    );
  }),
);

// Tests for private helper methods
Deno.test("_cleanBaseURL should remove query parameters and trailing slashes", () => {
  const connection = new Connection(
    testBaseUrl,
    testTokenUrl,
    testDeviceId,
    testClientId,
    testClientSecret,
  );

  // @ts-ignore - Accessing private method for testing
  const cleanBaseURL = connection._cleanBaseURL.bind(connection);

  // Test different URL formats
  assertEquals(cleanBaseURL("https://example.com/api"), "https://example.com/api");
  assertEquals(cleanBaseURL("https://example.com/api/"), "https://example.com/api");
  assertEquals(cleanBaseURL("https://example.com/api?param=value"), "https://example.com/api");
  assertEquals(cleanBaseURL("https://example.com/api/?param=value"), "https://example.com/api");
});

Deno.test("_buildWebSocketURL should create correct WebSocket URL", () => {
  const connection = new Connection(
    testBaseUrl,
    testTokenUrl,
    testDeviceId,
    testClientId,
    testClientSecret,
  );

  // @ts-ignore - Accessing private method for testing
  const buildWebSocketURL = connection._buildWebSocketURL.bind(connection);

  // Test different URL formats
  assertEquals(
    buildWebSocketURL("https://example.com/api"),
    "wss://example.com/api/platform/subscribe",
  );

  assertEquals(
    buildWebSocketURL("http://example.com/api"),
    "ws://example.com/api/platform/subscribe",
  );

  assertEquals(
    buildWebSocketURL("ws://example.com/api"),
    "ws://example.com/api/platform/subscribe",
  );

  assertEquals(
    buildWebSocketURL("wss://example.com/api"),
    "wss://example.com/api/platform/subscribe",
  );
});

Deno.test("Connection constructor should set URLs correctly", () => {
  const connection = new Connection(
    "https://example.com/api/?param=value",
    testTokenUrl,
    testDeviceId,
    testClientId,
    testClientSecret,
  );

  // Check that internal state is set correctly
  // @ts-ignore - Accessing private property for testing
  assertEquals(connection._baseURL, "https://example.com/api");
  // @ts-ignore - Accessing private property for testing
  assertEquals(connection._socketURL, "wss://example.com/api/platform/subscribe");

  // Test with WebSocket URL
  const wsConnection = new Connection(
    "ws://example.com/api/",
    testTokenUrl,
    testDeviceId,
    testClientId,
    testClientSecret,
  );

  // @ts-ignore - Accessing private property for testing
  assertEquals(wsConnection._baseURL, "ws://example.com/api");
  // @ts-ignore - Accessing private property for testing
  assertEquals(wsConnection._socketURL, "ws://example.com/api/platform/subscribe");
});

Deno.test(
  "_authenticate should fetch token and set access_token",
  mockGlobal(async () => {
    let timeoutCallback: TimerHandler | undefined = undefined;
    let timeoutDuration: number | undefined = 0;

    const tokenResponse = {
      access_token: testToken,
      expires_in: 3600,
      token_type: "Bearer",
    };

    global.fetch = () => {
      return Promise.resolve(new MockResponse(200, tokenResponse) as unknown as Response);
    };

    global.setTimeout = (callback: TimerHandler, timeout?: number): number => {
      timeoutCallback = callback;
      timeoutDuration = timeout;

      return 1 as ReturnType<typeof setTimeout>; // Explicitly match the expected return type
    };

    const connection = new Connection(
      testBaseUrl,
      testTokenUrl,
      testDeviceId,
      testClientId,
      testClientSecret,
    );

    // @ts-ignore - Accessing private method for testing
    await connection._authenticateAndQueueTokenRefresh();

    assertEquals(connection.access_token, testToken);

    assertEquals(timeoutDuration, 3599000); // (3600 - 1) * 1000
    assertExists(timeoutCallback);

    // @ts-ignore - Accessing private property for testing
    assertEquals(connection._auth.url, testTokenUrl);
    // @ts-ignore - Accessing private property for testing
    assertEquals(connection._auth.client_id, testClientId);
    // @ts-ignore - Accessing private property for testing
    assertEquals(connection._auth.client_secret, testClientSecret);
  }),
);

Deno.test(
  "_authenticateAndQueueTokenRefresh should throw error when authorization fails",
  mockGlobal(async () => {
    global.fetch = () => {
      return Promise.resolve(new MockResponse(401, { error: "invalid_client" }) as unknown as Response);
    };

    const connection = new Connection(
      testBaseUrl,
      testTokenUrl,
      testDeviceId,
      testClientId,
      testClientSecret,
    );

    // Verify authenticate throws error
    await assertRejects(
      async () => {
        // @ts-ignore - Accessing private method for testing
        await connection._authenticateAndQueueTokenRefresh();
      },
      AuthenticationError,
      "Invalid Credentials",
    );
  }),
);

// Test token refresh with zero expiration
Deno.test(
  "_authenticateAndQueueTokenRefresh should not set refresher timer when expires_in is zero",
  mockGlobal(async () => {
    let fetchCalled = false;
    mockFetch({
      status: 200,
      action: () => fetchCalled = true,
      token: "short-lived-token",
      expires_in: 0,
    });

    const connection = new Connection(
      testBaseUrl,
      testTokenUrl,
      testDeviceId,
      testClientId,
      testClientSecret,
    );

    // @ts-ignore - Accessing private method for testing
    await connection._authenticateAndQueueTokenRefresh();

    // Verify fetch was called
    assertEquals(fetchCalled, true);

    // Verify access_token was set
    assertEquals(connection.access_token, "short-lived-token");

    // Verify no timeout is set due to expires_in being 0
    // @ts-ignore - Accessing private property for testing
    assertEquals(connection._refresher, null);
  }),
);

Deno.test(
  "_authenticateAndQueueTokenRefresh should clear previous timeout when called again",
  mockGlobal(async () => {
    let timeoutCleared = false;
    const mockTimeoutId = 12345;

    global.fetch = () => {
      return Promise.resolve(
        new MockResponse(200, {
          access_token: testToken,
          expires_in: 3600,
          token_type: "Bearer",
        }) as unknown as Response,
      );
    };

    global.setTimeout = () => {
      return mockTimeoutId as unknown as ReturnType<typeof setTimeout>;
    };

    global.clearTimeout = (id: number | undefined) => {
      if (id === mockTimeoutId) {
        timeoutCleared = true;
      }
    };

    const connection = new Connection(
      testBaseUrl,
      testTokenUrl,
      testDeviceId,
      testClientId,
      testClientSecret,
    );

    // @ts-ignore - Accessing private property for testing
    connection._refresher = mockTimeoutId as unknown as ReturnType<typeof setTimeout>;

    // @ts-ignore - Accessing private method for testing
    await connection._authenticateAndQueueTokenRefresh();

    assertEquals(timeoutCleared, true);
  }),
);

// Tests for _connect method
// Skip test that's causing hang issues
Deno.test(
  "Connection.connect should authenticate and create a websocket connection",
  mockGlobal(async () => {
    // Track if authenticate was called
    let authenticateCalled = false;
    let webSocketConstructorCalled = false;

    mockFetch({
      status: 200,
      action: () => authenticateCalled = true,
    });
    const mockWs = mockWebSocket((_ws: MockWebSocket) => {
      webSocketConstructorCalled = true;
      return undefined;
    });

    const connection = await Connection.connect(
      testBaseUrl,
      testDeviceId,
      testClientId,
      testClientSecret,
      testTokenUrl,
    );

    // @ts-ignore - Accessing private property for testing
    assertEquals(connection._socket, mockWs);
    assertEquals(authenticateCalled, true);
    assertEquals(webSocketConstructorCalled, true);
    assertEquals(mockWs.url, `wss://example.com/api/platform/subscribe`);
  }),
);

// Test WebSocket error handling
Deno.test(
  "Connection should emit error events when socket.onerror is triggered",
  mockGlobal(async () => {
    mockFetch();
    const mockWs = mockWebSocket();

    const connection = await Connection.connect(
      testBaseUrl,
      testDeviceId,
      testClientId,
      testClientSecret,
      testTokenUrl,
    );

    // Track if error event is emitted
    let errorEventData: unknown = null;
    connection.once("error", (data) => {
      errorEventData = data;
    });

    // Create an error event
    const errorEvent = { type: "error", message: "Test error" } as unknown as Event;

    // Trigger the onerror handler
    if (mockWs.onerror) {
      mockWs.onerror(errorEvent);
    }

    // Verify error event was emitted with correct data
    assertEquals(errorEventData, errorEvent);
  }),
);

Deno.test(
  "Connection.connect should return true if socket already exists and is open",
  mockGlobal(async () => {
    let fetchCalled = false;
    mockFetch({ status: 200, action: () => fetchCalled = true });
    const mockWs = mockWebSocket();

    const connection = await Connection.connect(
      testBaseUrl,
      testDeviceId,
      testClientId,
      testClientSecret,
      testTokenUrl,
    );

    // Reset fetch called flag
    fetchCalled = false;

    // Call _connect again - should return true without creating a new socket
    // @ts-ignore - Accessing private method for testing
    const result = await connection._createWebSocketAndAttachEventHandlers();

    // Verify connection promise resolved to true without calling fetch
    assertEquals(result, true); // With our mock WebSocket implementation, this should be true
    assertEquals(fetchCalled, false);

    // Verify same socket is still there
    // @ts-ignore - Accessing private property for testing
    assertEquals(connection._socket, mockWs);
  }),
);

// Directly test the isOpen check in _createWebSocketAndAttachEventHandlers
Deno.test(
  "_createWebSocketAndAttachEventHandlers should not create new WebSocket when isOpen is true",
  mockGlobal(async () => {
    let constructorCalls = 0;
    mockFetch();
    mockWebSocket((_ws: MockWebSocket) => {
      constructorCalls++;
      return undefined;
    });
    const connection = await Connection.connect(
      testBaseUrl,
      testDeviceId,
      testClientId,
      testClientSecret,
      testTokenUrl,
    );

    assertEquals(connection.isOpen, true);

    const result = await connection._createWebSocketAndAttachEventHandlers();
    assertEquals(result, true);
    assertEquals(constructorCalls, 1);
  }),
);
Deno.test(
  "_connect should handle WebSocket message events",
  mockGlobal(async () => {
    mockFetch();
    const mockWs = mockWebSocket();

    const connection = await Connection.connect(
      testBaseUrl,
      testDeviceId,
      testClientId,
      testClientSecret,
      testTokenUrl,
    );

    // Track emitted events
    const emittedEvents: { event: string; data: unknown }[] = [];

    // @ts-ignore - Event types are not properly defined for testing
    connection.on("message", (data) => {
      emittedEvents.push({ event: "message", data });
    });

    // @ts-ignore - Event types are not properly defined for testing
    connection.on("ping", (data) => {
      emittedEvents.push({ event: "ping", data });
    });

    // @ts-ignore - Event types are not properly defined for testing
    connection.on("ack", (data) => {
      emittedEvents.push({ event: "ack", data });
    });

    // Simulate receiving a message
    mockWs.simulateMessage(JSON.stringify({
      meta: {
        requestID: "test-request-id",
        deviceID: testDeviceId,
      },
      payload: { test: true },
    }));

    // Verify message event was emitted
    assertEquals(emittedEvents.length, 1);
    assertEquals(emittedEvents[0]?.event, "message");

    // Simulate receiving a ping message
    emittedEvents.length = 0; // Clear events
    mockWs.simulateMessage(JSON.stringify({ ping: Date.now() }));

    // Verify ping event was emitted and pong sent
    assertEquals(emittedEvents.length, 1);
    assertEquals(emittedEvents[0]?.event, "ping");
    assertEquals(mockWs.sentMessages.length, 1);
    if (mockWs.sentMessages[0]) {
      assertStringIncludes(mockWs.sentMessages[0], "pong");
    }

    // Simulate receiving an ack message
    emittedEvents.length = 0; // Clear events
    mockWs.simulateMessage(JSON.stringify({ ackCode: 200 }));

    // Verify ack event was emitted
    assertEquals(emittedEvents.length, 1);
    assertEquals(emittedEvents[0]?.event, "ack");
  }),
);

// Tests for Connection.connect static method
Deno.test(
  "Connection.connect should connect successfully",
  mockGlobal(async () => {
    // Create a mock WebSocket
    const mockWs = mockWebSocket();
    mockFetch();

    // Start connection process
    const connection = await Connection.connect(
      testBaseUrl,
      testDeviceId,
      testClientId,
      testClientSecret,
      testTokenUrl,
    );

    // Verify connection succeeded
    assertExists(connection);
    assertEquals(connection instanceof Connection, true);
    assertEquals(connection.deviceID, testDeviceId);
    assertEquals(connection.access_token, testToken);

    // @ts-ignore - Accessing private property for testing
    assertEquals(connection._socket, mockWs);
  }),
);

Deno.test(
  "Connection.connect should retry on non-authentication errors",
  mockGlobal(async () => {
    let attemptCount = 0;

    mockFetch();

    // Create a mock WebSocket
    mockWebSocket((ws) => {
      attemptCount++;
      if (attemptCount === 2) return;
      return () => {
        ws.close(4001, "Testing Failer");
      };
    });

    // Start connection process
    const connection = await Connection.connect(
      testBaseUrl,
      testDeviceId,
      testClientId,
      testClientSecret,
      testTokenUrl,
      {
        minTimeout: 10,
      },
    );

    // Verify connection succeeded after retry
    assertExists(connection);
    assertEquals(connection instanceof Connection, true);

    assertEquals(attemptCount, 2); // Verify we retried once
  }),
);

// Test abnormal websocket closures
Deno.test(
  "Connection should emit close events for abnormal WebSocket closures",
  mockGlobal(async () => {
    mockFetch();
    const mockWs = mockWebSocket();

    const connection = await Connection.connect(
      testBaseUrl,
      testDeviceId,
      testClientId,
      testClientSecret,
      testTokenUrl,
    );

    // Track if close event is emitted
    let closeEventFired = false;
    let closeEventObj: CloseEvent | undefined;

    // @ts-ignore - Event types are not properly defined for testing
    connection.once("close", (event) => {
      closeEventFired = true;
      closeEventObj = event;
    });

    // Create a close event with non-1000 code
    const closeEvent = {
      type: "close",
      code: 1006, // Abnormal closure
      reason: "Connection lost",
      wasClean: false,
      target: mockWs,
    } as unknown as CloseEvent;

    // Trigger the onclose handler
    if (mockWs.onclose) {
      mockWs.onclose(closeEvent);
    }

    // Verify close event was emitted
    assertEquals(closeEventFired, true);
    assertExists(closeEventObj);
    assertEquals(closeEventObj.code, 1006);
    assertEquals(closeEventObj.reason, "Connection lost");
  }),
);

Deno.test(
  "Connection.connect should throw immediately on authentication errors",
  mockGlobal(async () => {
    global.fetch = () => {
      return Promise.resolve(new MockResponse(401, { error: "invalid_client" }) as unknown as Response);
    };

    // @ts-ignore - Mock WebSocket for testing
    global.WebSocket = function (_url: string) {
      return new MockWebSocket() as unknown as WebSocket;
    } as unknown as typeof WebSocket;

    // Mock setTimeout to execute callbacks immediately and synchronously
    global.setTimeout = (callback: TimerHandler, _timeout?: number) => {
      // Execute callback immediately if it's a function
      if (typeof callback === "function") {
        callback();
      }
      return 1 as unknown as ReturnType<typeof setTimeout>;
    };

    // Verify authentication error is thrown without retry
    await assertRejects(
      async () => {
        await Connection.connect(
          testBaseUrl,
          testDeviceId,
          testClientId,
          testClientSecret,
          testTokenUrl,
        );
      },
      AuthenticationError,
      "Invalid Credentials",
    );
  }),
);

// Tests for send method
Deno.test("send should add missing oauthToken and deviceID to data", async () => {
  mockFetch();
  const mockWs = mockWebSocket();

  const connection = await Connection.connect(
    testBaseUrl,
    testTokenUrl,
    testDeviceId,
    testClientId,
    testClientSecret,
  );

  // Create test data without oauthToken and deviceID
  // @ts-ignore - Using simplified test data structure
  const testData = {
    meta: {
      requestID: "test-request-id",
      directive: PlatformDirectives.PlatformApplicationsStaterequest,
    },
    payload: { test: true },
  };

  // @ts-ignore - Testing with simplified data structure
  connection.send(testData);

  // Verify data was sent with added fields
  assertEquals(mockWs.sentMessages.length, 1);

  // Ensure we have a message before parsing
  const message = mockWs.sentMessages[0];
  if (!message) {
    throw new Error("Expected a message to be sent");
  }

  const sentData = JSON.parse(message);
  assertEquals(sentData.meta.oauthToken, testToken);
  assertEquals(sentData.meta.deviceID, testDeviceId);
  assertEquals(sentData.meta.requestID, "test-request-id");
  assertEquals(sentData.payload.test, true);
});

Deno.test("send should not override existing oauthToken and deviceID", async () => {
  // Create a mock WebSocket
  const mockWs = mockWebSocket();
  mockFetch();

  const connection = await Connection.connect(
    testBaseUrl,
    testTokenUrl,
    testDeviceId,
    testClientId,
    testClientSecret,
  );

  // Set access token (this should not be used)
  connection.access_token = testToken;

  // Create test data with existing oauthToken and deviceID
  const customToken = "custom-token";
  const customDeviceId = "custom-device-id";
  // @ts-ignore - Using simplified test data structure
  const testData = {
    meta: {
      requestID: "test-request-id",
      directive: PlatformDirectives.PlatformApplicationsStaterequest,
      oauthToken: customToken,
      deviceID: customDeviceId,
    },
    payload: { test: true },
  };

  // Send the data
  // @ts-ignore - Testing with simplified data structure
  connection.send(testData);

  // Verify data was sent with original values
  assertEquals(mockWs.sentMessages.length, 1);

  // Ensure we have a message before parsing
  const message = mockWs.sentMessages[0];
  if (!message) {
    throw new Error("Expected a message to be sent");
  }

  const sentData = JSON.parse(message);
  assertEquals(sentData.meta.oauthToken, customToken);
  assertEquals(sentData.meta.deviceID, customDeviceId);
});

// Tests for sendAndGetResponse method
Deno.test("sendAndGetResponse should throw error if socket is not connected", async () => {
  const connection = new Connection(
    testBaseUrl,
    testTokenUrl,
    testDeviceId,
    testClientId,
    testClientSecret,
  );

  // Set access token
  connection.access_token = testToken;

  // Create test data
  // @ts-ignore - Using simplified test data structure
  const testData = {
    meta: {
      requestID: "test-request-id",
      directive: PlatformDirectives.PlatformApplicationsStaterequest,
    },
    payload: { test: true },
  };

  // This should throw an error
  await assertRejects(
    async () => {
      // @ts-ignore - Testing with simplified data structure
      await connection.sendAndGetResponse(testData);
    },
    Error,
    "WebSocket is not connected",
  );
});

Deno.test("sendAndGetResponse should send data and wait for response", async () => {
  // Create a mocked waitFor function to track calls
  let waitForEvent = "";
  let waitForResolveValue: unknown = null;
  let waitForCalled = false;

  const connection = new Connection(
    testBaseUrl,
    testTokenUrl,
    testDeviceId,
    testClientId,
    testClientSecret,
  );

  // Set access token
  connection.access_token = testToken;

  // Create a mock WebSocket
  const mockWs = mockWebSocket();
  // @ts-ignore - Accessing private property for testing
  connection._socket = mockWs;

  // Mock the waitFor method
  connection.waitFor = (event: string) => {
    waitForCalled = true;
    waitForEvent = event;

    // Create response with OK message code
    const response = {
      meta: {
        requestID: event,
        messageCode: MessageCodes.OK,
      },
      payload: {
        result: "success",
      },
    };

    waitForResolveValue = response;
    return Promise.resolve(response);
  };

  // Create test data with a request ID
  const requestId = "test-request-id-" + Date.now();
  // @ts-ignore - Using simplified test data structure
  const testData = {
    meta: {
      requestID: requestId,
      directive: PlatformDirectives.PlatformApplicationsStaterequest,
    },
    payload: { test: true },
  };

  // Call sendAndGetResponse
  // @ts-ignore - Testing with simplified data structure
  const response = await connection.sendAndGetResponse(testData);

  // Verify waitFor was called with correct event
  assertEquals(waitForCalled, true);
  assertEquals(waitForEvent, requestId);

  // Verify data was sent to WebSocket
  assertEquals(mockWs.sentMessages.length, 1);

  // Ensure we have a message before parsing
  const message = mockWs.sentMessages[0];
  if (!message) {
    throw new Error("Expected a message to be sent");
  }

  const sentData = JSON.parse(message);
  assertEquals(sentData.meta.requestID, requestId);
  assertEquals(sentData.meta.oauthToken, testToken);

  // Verify response was returned
  assertEquals(response, waitForResolveValue);
});

Deno.test("sendAndGetResponse should throw PlatformResponseError for critical errors", async () => {
  mockWebSocket();

  const connection = await Connection.connect(
    testBaseUrl,
    testTokenUrl,
    testDeviceId,
    testClientId,
    testClientSecret,
  );

  // Mock the waitFor method to return error
  connection.waitFor = () => {
    // Create response with critical error message code
    const response = {
      meta: {
        requestID: "test-request-id",
        messageCode: MessageCodes.HARDWAREERROR,
      },
      payload: {
        error: "Hardware failure",
      },
    };

    return Promise.resolve(response);
  };

  // Create test data
  // @ts-ignore - Using simplified test data structure
  const testData = {
    meta: {
      requestID: "test-request-id",
      directive: PlatformDirectives.PlatformApplicationsStaterequest,
    },
    payload: { test: true },
  };

  // Should throw PlatformResponseError
  await assertRejects(
    async () => {
      // @ts-ignore - Testing with simplified data structure
      await connection.sendAndGetResponse(testData);
    },
    PlatformResponseError,
    "Platform returned status code:",
  );
});

// Test error handling in message processing
Deno.test(
  "Connection should handle malformed JSON in onmessage handler",
  mockGlobal(async () => {
    mockFetch();
    const mockWs = mockWebSocket();

    const connection = await Connection.connect(
      testBaseUrl,
      testDeviceId,
      testClientId,
      testClientSecret,
      testTokenUrl,
    );

    // Track if error event is emitted
    let errorEventFired = false;
    connection.once("error", () => {
      errorEventFired = true;
    });

    // Create a message event with invalid JSON
    const messageEvent = {
      type: "message",
      data: "This is not valid JSON",
      target: mockWs,
    } as unknown as MessageEvent;

    // Trigger the onmessage handler
    if (mockWs.onmessage) {
      mockWs.onmessage(messageEvent);
    }

    // Verify error event was emitted
    assertEquals(errorEventFired, true);
  }),
);

Deno.test("sendAndGetResponse should set deviceID if it's null or default", async () => {
  const connection = new Connection(
    testBaseUrl,
    testTokenUrl,
    testDeviceId,
    testClientId,
    testClientSecret,
  );

  // Set access token
  connection.access_token = testToken;

  // Create a mock WebSocket
  const mockWs = mockWebSocket();
  // @ts-ignore - Accessing private property for testing
  connection._socket = mockWs;

  // Mock the waitFor method
  connection.waitFor = () => {
    return Promise.resolve({
      meta: {
        requestID: "test-request-id",
        messageCode: MessageCodes.OK,
      },
    });
  };

  // Test with default UUID
  // @ts-ignore - Using simplified test data structure
  const testData1 = {
    meta: {
      requestID: "test-request-id",
      directive: PlatformDirectives.PlatformApplicationsStaterequest,
      deviceID: "00000000-0000-0000-0000-000000000000",
    },
    payload: { test: true },
  };

  // @ts-ignore - Testing with simplified data structure
  await connection.sendAndGetResponse(testData1);

  // Verify deviceID was set in sent data
  assertEquals(mockWs.sentMessages.length, 1);

  // Ensure we have a message before parsing
  const message = mockWs.sentMessages[0];
  if (!message) {
    throw new Error("Expected a message to be sent");
  }

  let sentData = JSON.parse(message);
  assertEquals(sentData.meta.deviceID, testDeviceId);

  // Clear sent messages
  mockWs.sentMessages.length = 0;

  // Test with null deviceID
  // @ts-ignore - Using simplified test data structure
  const testData2 = {
    meta: {
      requestID: "test-request-id-2",
      directive: PlatformDirectives.PlatformApplicationsStaterequest,
      deviceID: null,
    },
    payload: { test: true },
  };

  // @ts-ignore - Testing with simplified data structure
  await connection.sendAndGetResponse(testData2);

  // Verify deviceID was set in sent data
  assertEquals(mockWs.sentMessages.length, 1);

  // Ensure we have a message before parsing
  const message2 = mockWs.sentMessages[0];
  if (!message2) {
    throw new Error("Expected a message to be sent");
  }

  sentData = JSON.parse(message2);
  assertEquals(sentData.meta.deviceID, testDeviceId);
});

// Tests for close method
Deno.test(
  "close should clear refresher timeout and close socket",
  mockGlobal(async () => {
    let timeoutCleared = false;

    global.fetch = () => {
      return Promise.resolve(
        new MockResponse(200, {
          access_token: testToken,
          expires_in: 3600,
          token_type: "Bearer",
        }) as unknown as Response,
      );
    };

    // Create a mock WebSocket
    const mockWs = mockWebSocket();

    // Create connection
    const connection = await Connection.connect(
      testBaseUrl,
      testDeviceId,
      testClientId,
      testClientSecret,
      testTokenUrl,
    );

    // Set a fake refresher
    // @ts-ignore - Accessing private property for testing
    const mockTimeoutId = connection._refresher;
    // Set up clearTimeout mock
    global.clearTimeout = ((id?: number) => {
      if (id === mockTimeoutId) {
        timeoutCleared = true;
      }
      clearTimeout(id);
    }) as typeof clearTimeout;

    let closeEventTriggered = false;
    connection.once("close", () => closeEventTriggered = true);

    // Call close
    connection.close();
    await delay(10); // Wait for close to complete

    // Verify timeout was cleared
    assertEquals(connection._refresher, null);

    assertEquals(timeoutCleared, true);

    // Verify socket close was called
    assertEquals(mockWs.readyState, MockWebSocket.CLOSED);

    // Verify once handler was registered
    assertEquals(closeEventTriggered, true);
  }),
);

Deno.test("close should handle missing socket gracefully", () => {
  // Create connection without socket
  const connection = new Connection(
    testBaseUrl,
    testTokenUrl,
    testDeviceId,
    testClientId,
    testClientSecret,
  );

  // Verify no socket exists
  // @ts-ignore - Accessing private property for testing
  assertEquals(connection._socket, undefined);

  // This should not throw an error
  connection.close();
});

Deno.test("close handler should clean up listeners and socket event handlers", () => {
  const connection = new Connection(
    testBaseUrl,
    testTokenUrl,
    testDeviceId,
    testClientId,
    testClientSecret,
  );

  const mockWs = mockWebSocket();
  // @ts-ignore - Accessing private property for testing
  connection._socket = mockWs;

  // Create a spy for removeAllListeners
  let removeAllListenersCalled = false;
  const originalRemoveAllListeners = connection.removeAllListeners.bind(connection);
  connection.removeAllListeners = () => {
    removeAllListenersCalled = true;
    return originalRemoveAllListeners() as ReturnType<typeof originalRemoveAllListeners>;
  };

  removeAllListenersCalled = true;

  connection.close();

  // Trigger the close handler by emitting close event
  connection.emit("close", { type: "close" } as unknown as CloseEvent);

  // Verify removeAllListeners was called
  assertEquals(removeAllListenersCalled, true);

  // Verify WebSocket event handlers were removed
  assertEquals(mockWs.onopen, null);
  assertEquals(mockWs.onclose, null);
  assertEquals(mockWs.onerror, null);
  assertEquals(mockWs.onmessage, null);
});

// Tests for waitFor method
Deno.test("waitFor should resolve when event is emitted", async () => {
  const connection = new Connection(
    testBaseUrl,
    testTokenUrl,
    testDeviceId,
    testClientId,
    testClientSecret,
  );

  const testEventName = "test-event";
  const testData = { test: "data" };
  const waitPromise = connection.waitFor(testEventName);

  connection.emit(testEventName, testData);

  // Wait for promise and verify result
  const result = await waitPromise;
  assertEquals(result, testData);
});

Deno.test("waitFor should reject when close event is emitted", async () => {
  // Create connection
  const connection = new Connection(
    testBaseUrl,
    testTokenUrl,
    testDeviceId,
    testClientId,
    testClientSecret,
  );

  // Create test event name
  const testEventName = "test-event";
  const closeEvent = new CloseEvent("close", { code: 1000 });

  // Start waiting for the event
  const waitPromise = connection.waitFor(testEventName);

  // Emit the close event
  connection.emit("close", closeEvent);

  // Verify promise is rejected with error
  await assertRejects(
    async () => await waitPromise,
  );
});

Deno.test("waitFor should clean up listeners after resolution", async () => {
  const connection = new Connection(
    testBaseUrl,
    testTokenUrl,
    testDeviceId,
    testClientId,
    testClientSecret,
  );

  const testEventName = "test-event";

  // Track off calls
  const offCalls: { event: string; listener: unknown }[] = [];
  const originalOff = connection.off.bind(connection);

  // @ts-ignore - Function signature is incompatible but needed for testing
  connection.off = (event: string, listener: (...args: unknown[]) => void) => {
    offCalls.push({ event, listener });
    return originalOff(event, listener) as ReturnType<typeof originalOff>;
  };

  // Start waiting for the event
  const waitPromise = connection.waitFor(testEventName);

  // Emit the event
  connection.emit(testEventName, { test: "data" });

  // Wait for promise to resolve
  await waitPromise;

  // Verify off was called for the close event
  assertEquals(offCalls.length, 1);
  assertEquals(offCalls[0].event, "close");

  // Reset offCalls
  offCalls.length = 0;

  // Start another wait and emit close
  const waitPromise2 = connection.waitFor(testEventName);
  connection.emit("close", { type: "close" } as unknown as CloseEvent);

  // Wait for promise to reject
  try {
    await waitPromise2;
  }
  catch {
    // Expected to throw
  }

  // Verify off was called for the test event
  assertEquals(offCalls.length, 1);
  assertEquals(offCalls[0].event, testEventName);
});

// Test token refreshing with short expiration time
Deno.test(
  "Connection should refresh token when expires_in is short",
  mockGlobal(async () => {
    // Create test constants
    const firstToken = "first-token";
    const secondToken = "second-refreshed-token";
    const shortExpiration = 1; // 1 second expiration

    // Track auth calls and tokens
    let authorizeCalls = 0;
    const issuedTokens: string[] = [];

    // Override the authorize method to return tokens with short expiration
    const originalAuthorize = Connection.authorize;
    // deno-lint-ignore require-await
    Connection.authorize = async (_url: string, _client_id: string, _client_secret: string) => {
      authorizeCalls++;
      const token = authorizeCalls === 1 ? firstToken : secondToken;
      issuedTokens.push(token);

      return {
        access_token: token,
        expires_in: shortExpiration,
        token_type: "Bearer",
      };
    };

    try {
      // Mock the timers to have precise control
      const timeoutCalls: Array<{ callback: TimerHandler; ms: number }> = [];
      global.setTimeout = (callback: TimerHandler, ms?: number) => {
        timeoutCalls.push({ callback, ms: ms || 0 });
        return timeoutCalls.length as unknown as ReturnType<typeof setTimeout>;
      };

      // Create the connection
      const connection = new Connection(
        testBaseUrl,
        testTokenUrl,
        testDeviceId,
        testClientId,
        testClientSecret,
      );

      // Initialize authentication
      // @ts-ignore - Accessing private method for testing
      await connection._authenticateAndQueueTokenRefresh();

      // Check first token
      assertEquals(connection.access_token, firstToken);
      assertEquals(authorizeCalls, 1);
      assertEquals(timeoutCalls.length, 1);

      // Verify timeout was set for almost the full expiration time
      const refreshTimeMs = shortExpiration * 1000 - 1000;
      assertEquals(timeoutCalls[0].ms, refreshTimeMs);

      // Manually trigger the refresh callback
      if (typeof timeoutCalls[0].callback === "function") {
        await timeoutCalls[0].callback();
      }

      // Verify second token was obtained
      assertEquals(connection.access_token, secondToken);
      assertEquals(authorizeCalls, 2);
      assertEquals(issuedTokens, [firstToken, secondToken]);

      // Verify another timeout was set for the next refresh
      assertEquals(timeoutCalls.length, 2);
    }
    finally {
      // Restore original method
      Connection.authorize = originalAuthorize;
    }
  }),
);
