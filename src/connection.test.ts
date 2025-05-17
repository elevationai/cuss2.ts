import { assertEquals, assertExists, assertRejects, assertStringIncludes } from "https://deno.land/std/testing/asserts.ts";
import { Connection } from "./connection.ts";
import { AuthenticationError } from "./models/Errors.ts";
import { PlatformResponseError } from "./models/platformResponseError.ts";
import { MessageCodes, PlatformDirectives } from "cuss2-typescript-models";

// We'll use Deno's built-in test functions rather than BDD style
// This allows us to match the existing helper.test.ts style

// Mock for the WebSocket class
class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  
  url: string;
  readyState: number = MockWebSocket.CONNECTING;
  bufferedAmount: number = 0;
  extensions: string = "";
  protocol: string = "";
  binaryType: BinaryType = "blob";
  
  // Event handlers
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  
  // Tracking for testing
  sentMessages: string[] = [];
  
  constructor(url: string) {
    this.url = url;
  }
  
  // Methods
  close(_code?: number, _reason?: string): void {
    this.readyState = MockWebSocket.CLOSED;
    if (this.onclose) {
      const closeEvent = { 
        type: "close", 
        wasClean: true, 
        code: 1000, 
        reason: "", 
        target: this
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
        target: this 
      } as unknown as MessageEvent;
      this.onmessage(messageEvent);
    }
  }
  
  // Simulate connection opening
  simulateOpen(): void {
    this.readyState = MockWebSocket.OPEN;
    if (this.onopen) {
      const openEvent = { 
        type: "open", 
        target: this 
      } as unknown as Event;
      this.onopen(openEvent);
    }
  }
  
  // Simulate error
  simulateError(error: Error): void {
    if (this.onerror) {
      const errorEvent = { 
        type: "error", 
        error, 
        message: error.message, 
        target: this 
      } as unknown as Event;
      this.onerror(errorEvent);
    }
  }
  
  // Not needed for our tests but part of the interface
  addEventListener(): void {}
  removeEventListener(): void {}
  dispatchEvent(): boolean { return true; }
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

// Tests for the Connection class

// Test for Connection.authorize
Deno.test("Connection.authorize should get and return a token", async () => {
  // Save the original fetch function
  const originalFetch = globalThis.fetch;
  
  try {
    // Mock the fetch function
    globalThis.fetch = async (url: string | URL | Request, options?: RequestInit) => {
      // Verify correct URL and options
      assertEquals(url, testTokenUrl);
      assertEquals(options?.method, "POST");
      assertEquals(
        options?.headers?.["Content-Type"], 
        "application/x-www-form-urlencoded"
      );
      
      // Extract and verify body parameters
      const bodyParams = new URLSearchParams(options?.body as string);
      assertEquals(bodyParams.get("client_id"), testClientId);
      assertEquals(bodyParams.get("client_secret"), testClientSecret);
      assertEquals(bodyParams.get("grant_type"), "client_credentials");
      
      // Return a successful response
      return new MockResponse(200, {
        access_token: testToken,
        expires_in: 3600,
        token_type: "Bearer"
      }) as unknown as Response;
    };
    
    // Call the method under test
    const result = await Connection.authorize(
      testTokenUrl,
      testClientId,
      testClientSecret
    );
    
    // Verify the result
    assertEquals(result.access_token, testToken);
    assertEquals(result.expires_in, 3600);
    assertEquals(result.token_type, "Bearer");
  } finally {
    // Restore the original fetch function
    globalThis.fetch = originalFetch;
  }
});

Deno.test("Connection.authorize should throw AuthenticationError for 401 responses", async () => {
  // Save the original fetch function
  const originalFetch = globalThis.fetch;
  
  try {
    // Mock the fetch function to return an error
    globalThis.fetch = async () => {
      return new MockResponse(401, { error: "invalid_client" }) as unknown as Response;
    };
    
    // Verify that calling the method throws the expected error
    await assertRejects(
      async () => {
        await Connection.authorize(testTokenUrl, testClientId, testClientSecret);
      },
      AuthenticationError,
      "Invalid Credentials"
    );
  } finally {
    // Restore the original fetch function
    globalThis.fetch = originalFetch;
  }
});

// Tests for private helper methods
Deno.test("_cleanBaseURL should remove query parameters and trailing slashes", () => {
  // Create a connection to test the private methods
  const connection = new Connection(
    testBaseUrl, 
    testTokenUrl, 
    testDeviceId, 
    testClientId, 
    testClientSecret
  );
  
  // We need to access the private method using property access
  // @ts-ignore - Accessing private method for testing
  const cleanBaseURL = connection._cleanBaseURL.bind(connection);
  
  // Test different URL formats
  assertEquals(cleanBaseURL("https://example.com/api"), "https://example.com/api");
  assertEquals(cleanBaseURL("https://example.com/api/"), "https://example.com/api");
  assertEquals(cleanBaseURL("https://example.com/api?param=value"), "https://example.com/api");
  assertEquals(cleanBaseURL("https://example.com/api/?param=value"), "https://example.com/api");
});

Deno.test("_buildWebSocketURL should create correct WebSocket URL", () => {
  // Create a connection to test the private methods
  const connection = new Connection(
    testBaseUrl, 
    testTokenUrl, 
    testDeviceId, 
    testClientId, 
    testClientSecret
  );
  
  // We need to access the private method using property access
  // @ts-ignore - Accessing private method for testing
  const buildWebSocketURL = connection._buildWebSocketURL.bind(connection);
  
  // Test different URL formats
  assertEquals(
    buildWebSocketURL("https://example.com/api"), 
    "wss://example.com/api/platform/subscribe"
  );
  
  assertEquals(
    buildWebSocketURL("http://example.com/api"), 
    "ws://example.com/api/platform/subscribe"
  );
  
  assertEquals(
    buildWebSocketURL("ws://example.com/api"), 
    "ws://example.com/api/platform/subscribe"
  );
  
  assertEquals(
    buildWebSocketURL("wss://example.com/api"), 
    "wss://example.com/api/platform/subscribe"
  );
});

// Test that constructor correctly uses these methods
Deno.test("Connection constructor should set URLs correctly", () => {
  const connection = new Connection(
    "https://example.com/api/?param=value", 
    testTokenUrl, 
    testDeviceId, 
    testClientId, 
    testClientSecret
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
    testClientSecret
  );
  
  // @ts-ignore - Accessing private property for testing
  assertEquals(wsConnection._baseURL, "ws://example.com/api");
  // @ts-ignore - Accessing private property for testing
  assertEquals(wsConnection._socketURL, "ws://example.com/api/platform/subscribe");
});

// Tests for _authenticate
Deno.test("_authenticate should fetch token and set access_token", async () => {
  // Save original methods to restore later
  const originalFetch = globalThis.fetch;
  const originalST = globalThis.setTimeout;
  let timeoutCallback: (() => void) | null = null;
  let timeoutDuration = 0;
  
  // Create a test token response
  const tokenResponse = {
    access_token: testToken,
    expires_in: 3600,
    token_type: "Bearer"
  };
  
  try {
    // Mock fetch
    globalThis.fetch = async () => {
      return new MockResponse(200, tokenResponse) as unknown as Response;
    };
    
    // Mock setTimeout to capture callback
    globalThis.setTimeout = (callback: any, duration: number) => {
      timeoutCallback = callback;
      timeoutDuration = duration;
      return 1 as unknown as ReturnType<typeof setTimeout>;
    };
    
    // Create a connection
    const connection = new Connection(
      testBaseUrl, 
      testTokenUrl, 
      testDeviceId, 
      testClientId, 
      testClientSecret
    );
    
    // Call the authenticate method
    // @ts-ignore - Accessing private method for testing
    await connection._authenticate();
    
    // Verify token was set
    assertEquals(connection.access_token, testToken);
    
    // Verify setTimeout was called with correct duration
    assertEquals(timeoutDuration, 3599000); // (3600 - 1) * 1000
    assertExists(timeoutCallback);
    
    // Verify auth object was set correctly
    // @ts-ignore - Accessing private property for testing
    assertEquals(connection._auth.url, testTokenUrl);
    // @ts-ignore - Accessing private property for testing
    assertEquals(connection._auth.client_id, testClientId);
    // @ts-ignore - Accessing private property for testing
    assertEquals(connection._auth.client_secret, testClientSecret);
  } finally {
    // Restore original methods
    globalThis.fetch = originalFetch;
    globalThis.setTimeout = originalST;
  }
});

Deno.test("_authenticate should throw error when authorization fails", async () => {
  // Save original fetch to restore later
  const originalFetch = globalThis.fetch;
  
  try {
    // Mock fetch to return error
    globalThis.fetch = async () => {
      return new MockResponse(401, { error: "invalid_client" }) as unknown as Response;
    };
    
    // Create a connection
    const connection = new Connection(
      testBaseUrl, 
      testTokenUrl, 
      testDeviceId, 
      testClientId, 
      testClientSecret
    );
    
    // Verify authenticate throws error
    await assertRejects(
      async () => {
        // @ts-ignore - Accessing private method for testing
        await connection._authenticate();
      },
      AuthenticationError,
      "Invalid Credentials"
    );
  } finally {
    // Restore original fetch
    globalThis.fetch = originalFetch;
  }
});

Deno.test("_authenticate should clear previous timeout when called again", async () => {
  // Save original methods to restore later
  const originalFetch = globalThis.fetch;
  const originalST = globalThis.setTimeout;
  const originalCT = globalThis.clearTimeout;
  
  let timeoutCleared = false;
  const mockTimeoutId = 12345;
  
  try {
    // Mock fetch
    globalThis.fetch = async () => {
      return new MockResponse(200, {
        access_token: testToken,
        expires_in: 3600,
        token_type: "Bearer"
      }) as unknown as Response;
    };
    
    // Mock setTimeout
    globalThis.setTimeout = () => {
      return mockTimeoutId as unknown as ReturnType<typeof setTimeout>;
    };
    
    // Mock clearTimeout
    globalThis.clearTimeout = (id: any) => {
      if (id === mockTimeoutId) {
        timeoutCleared = true;
      }
    };
    
    // Create a connection
    const connection = new Connection(
      testBaseUrl, 
      testTokenUrl, 
      testDeviceId, 
      testClientId, 
      testClientSecret
    );
    
    // Set a fake refresher
    // @ts-ignore - Accessing private property for testing
    connection._refresher = mockTimeoutId as unknown as ReturnType<typeof setTimeout>;
    
    // Call authenticate
    // @ts-ignore - Accessing private method for testing
    await connection._authenticate();
    
    // Verify timeout was cleared
    assertEquals(timeoutCleared, true);
  } finally {
    // Restore original methods
    globalThis.fetch = originalFetch;
    globalThis.setTimeout = originalST;
    globalThis.clearTimeout = originalCT;
  }
});

// Tests for _connect method
Deno.test("_connect should authenticate and create a websocket connection", async () => {
  // Save original WebSocket constructor
  const originalWebSocket = globalThis.WebSocket;
  const originalFetch = globalThis.fetch;
  const originalST = globalThis.setTimeout;
  
  // Track if authenticate was called
  let authenticateCalled = false;
  
  try {
    // Mock fetch for authenticate
    globalThis.fetch = async () => {
      authenticateCalled = true;
      return new MockResponse(200, {
        access_token: testToken,
        expires_in: 3600,
        token_type: "Bearer"
      }) as unknown as Response;
    };
    
    // Create a mock WebSocket that will respond to the constructor
    const mockWs = new MockWebSocket(testBaseUrl);
    globalThis.WebSocket = function(url: string) {
      assertEquals(url, `wss://example.com/api/platform/subscribe`);
      return mockWs;
    } as unknown as typeof WebSocket;
    
    // Mock setTimeout to prevent callbacks
    globalThis.setTimeout = () => 1 as unknown as ReturnType<typeof setTimeout>;
    
    // Create a connection
    const connection = new Connection(
      testBaseUrl, 
      testTokenUrl, 
      testDeviceId, 
      testClientId, 
      testClientSecret
    );
    
    // Create a promise for the _connect call
    const connectPromise = connection._connect();
    
    // Simulate WebSocket connect
    mockWs.simulateOpen();
    
    // Wait for the connect promise
    const result = await connectPromise;
    
    // Verify connection was successful
    assertEquals(result, true);
    assertEquals(authenticateCalled, true);
    
    // Verify WebSocket was set
    // @ts-ignore - Accessing private property for testing
    assertEquals(connection._socket, mockWs);
  } finally {
    // Restore original methods
    globalThis.WebSocket = originalWebSocket;
    globalThis.fetch = originalFetch;
    globalThis.setTimeout = originalST;
  }
});

Deno.test("_connect should return true if socket already exists and is open", async () => {
  // Save original WebSocket constructor
  const originalWebSocket = globalThis.WebSocket;
  const originalFetch = globalThis.fetch;
  
  try {
    // Mock fetch (this should not be called in this test)
    let fetchCalled = false;
    globalThis.fetch = async () => {
      fetchCalled = true;
      return new MockResponse(200, {
        access_token: testToken,
        expires_in: 3600,
        token_type: "Bearer"
      }) as unknown as Response;
    };
    
    // Create a connection
    const connection = new Connection(
      testBaseUrl, 
      testTokenUrl, 
      testDeviceId, 
      testClientId, 
      testClientSecret
    );
    
    // First authenticate to set the token
    // @ts-ignore - Accessing private method for testing
    await connection._authenticate();
    
    // Set a mock socket that's already open
    const mockWs = new MockWebSocket(testBaseUrl);
    mockWs.readyState = mockWs.OPEN;
    // @ts-ignore - Accessing private property for testing
    connection._socket = mockWs;
    
    // Reset fetch called flag
    fetchCalled = false;
    
    // Call _connect again - should return true without creating a new socket
    // @ts-ignore - Accessing private method for testing
    const result = await connection._connect();
    
    // Verify connection promise resolved to true without calling fetch
    assertEquals(result, true);
    assertEquals(fetchCalled, false);
    
    // Verify same socket is still there
    // @ts-ignore - Accessing private property for testing
    assertEquals(connection._socket, mockWs);
  } finally {
    // Restore original methods
    globalThis.WebSocket = originalWebSocket;
    globalThis.fetch = originalFetch;
  }
});

Deno.test("_connect should handle WebSocket message events", async () => {
  // Save original WebSocket constructor
  const originalWebSocket = globalThis.WebSocket;
  const originalFetch = globalThis.fetch;
  const originalST = globalThis.setTimeout;
  
  try {
    // Mock fetch
    globalThis.fetch = async () => {
      return new MockResponse(200, {
        access_token: testToken,
        expires_in: 3600,
        token_type: "Bearer"
      }) as unknown as Response;
    };
    
    // Create a mock WebSocket
    const mockWs = new MockWebSocket(testBaseUrl);
    globalThis.WebSocket = function() {
      return mockWs;
    } as unknown as typeof WebSocket;
    
    // Mock setTimeout
    globalThis.setTimeout = () => 1 as unknown as ReturnType<typeof setTimeout>;
    
    // Create a connection
    const connection = new Connection(
      testBaseUrl, 
      testTokenUrl, 
      testDeviceId, 
      testClientId, 
      testClientSecret
    );
    
    // Track emitted events
    const emittedEvents: { event: string; data: unknown }[] = [];
    connection.on("message", (data) => {
      emittedEvents.push({ event: "message", data });
    });
    connection.on("ping", (data) => {
      emittedEvents.push({ event: "ping", data });
    });
    connection.on("ack", (data) => {
      emittedEvents.push({ event: "ack", data });
    });
    
    // Start connecting
    const connectPromise = connection._connect();
    
    // Simulate WebSocket connect
    mockWs.simulateOpen();
    
    // Wait for connect to complete
    await connectPromise;
    
    // Simulate receiving a message
    mockWs.simulateMessage(JSON.stringify({
      meta: {
        requestID: "test-request-id",
        deviceID: testDeviceId
      },
      payload: { test: true }
    }));
    
    // Verify message event was emitted
    assertEquals(emittedEvents.length, 1);
    assertEquals(emittedEvents[0].event, "message");
    
    // Simulate receiving a ping message
    emittedEvents.length = 0; // Clear events
    mockWs.simulateMessage(JSON.stringify({ ping: Date.now() }));
    
    // Verify ping event was emitted and pong sent
    assertEquals(emittedEvents.length, 1);
    assertEquals(emittedEvents[0].event, "ping");
    assertEquals(mockWs.sentMessages.length, 1);
    assertStringIncludes(mockWs.sentMessages[0], "pong");
    
    // Simulate receiving an ack message
    emittedEvents.length = 0; // Clear events
    mockWs.simulateMessage(JSON.stringify({ ackCode: 200 }));
    
    // Verify ack event was emitted
    assertEquals(emittedEvents.length, 1);
    assertEquals(emittedEvents[0].event, "ack");
  } finally {
    // Restore original methods
    globalThis.WebSocket = originalWebSocket;
    globalThis.fetch = originalFetch;
    globalThis.setTimeout = originalST;
  }
});

// Tests for Connection.connect static method
Deno.test("Connection.connect should connect successfully", async () => {
  // Save original methods for restoration
  const originalWebSocket = globalThis.WebSocket;
  const originalFetch = globalThis.fetch;
  const originalST = globalThis.setTimeout;
  
  try {
    // Mock fetch for authentication
    globalThis.fetch = async () => {
      return new MockResponse(200, {
        access_token: testToken,
        expires_in: 3600,
        token_type: "Bearer"
      }) as unknown as Response;
    };
    
    // Create a mock WebSocket
    const mockWs = new MockWebSocket(testBaseUrl);
    globalThis.WebSocket = function() {
      return mockWs;
    } as unknown as typeof WebSocket;
    
    // Mock setTimeout to prevent callbacks
    globalThis.setTimeout = () => 1 as unknown as ReturnType<typeof setTimeout>;
    
    // Start connection process
    const connectionPromise = Connection.connect(
      testBaseUrl,
      testTokenUrl,
      testDeviceId,
      testClientId,
      testClientSecret
    );
    
    // Simulate WebSocket open
    mockWs.simulateOpen();
    
    // Wait for connection
    const connection = await connectionPromise;
    
    // Verify connection succeeded
    assertExists(connection);
    assertEquals(connection instanceof Connection, true);
    assertEquals(connection.deviceID, testDeviceId);
    assertEquals(connection.access_token, testToken);
    
    // @ts-ignore - Accessing private property for testing
    assertEquals(connection._socket, mockWs);
  } finally {
    // Restore original methods
    globalThis.WebSocket = originalWebSocket;
    globalThis.fetch = originalFetch;
    globalThis.setTimeout = originalST;
  }
});

Deno.test("Connection.connect should retry on non-authentication errors", async () => {
  // Save original methods for restoration
  const originalWebSocket = globalThis.WebSocket;
  const originalFetch = globalThis.fetch;
  const originalST = globalThis.setTimeout;
  const originalTimeout = setTimeout;
  let retriedCount = 0;
  
  try {
    // Mock fetch for authentication
    globalThis.fetch = async () => {
      return new MockResponse(200, {
        access_token: testToken,
        expires_in: 3600,
        token_type: "Bearer"
      }) as unknown as Response;
    };
    
    // Create mock WebSockets that will fail, then succeed
    let attemptCount = 0;
    globalThis.WebSocket = function() {
      const mockWs = new MockWebSocket(testBaseUrl);
      
      // First attempt fails, second succeeds
      if (attemptCount === 0) {
        // Simulate error that is not authentication related
        setTimeout(() => {
          mockWs.simulateError(new Error("Network error"));
        }, 10);
        attemptCount++;
      } else {
        // Second socket succeeds
        setTimeout(() => {
          mockWs.simulateOpen();
        }, 10);
      }
      
      return mockWs;
    } as unknown as typeof WebSocket;
    
    // Mock setTimeout to control retries
    globalThis.setTimeout = (callback: TimerHandler, ms?: number) => {
      if (ms && ms > 100) {
        // This is the retry timeout
        retriedCount++;
        // Execute immediately to speed up test
        return originalTimeout(callback, 10) as unknown as ReturnType<typeof setTimeout>;
      }
      // Other timeouts (like for our test harness)
      return originalTimeout(callback, 10) as unknown as ReturnType<typeof setTimeout>;
    };
    
    // Start connection process
    const connection = await Connection.connect(
      testBaseUrl,
      testTokenUrl,
      testDeviceId,
      testClientId,
      testClientSecret
    );
    
    // Verify connection succeeded after retry
    assertExists(connection);
    assertEquals(connection instanceof Connection, true);
    assertEquals(retriedCount, 1); // Verify we retried once
  } finally {
    // Restore original methods
    globalThis.WebSocket = originalWebSocket;
    globalThis.fetch = originalFetch;
    globalThis.setTimeout = originalST;
    clearTimeout();
  }
});

Deno.test("Connection.connect should throw immediately on authentication errors", async () => {
  // Save original methods for restoration
  const originalWebSocket = globalThis.WebSocket;
  const originalFetch = globalThis.fetch;
  const originalST = globalThis.setTimeout;
  
  try {
    // Mock fetch to return authentication error
    globalThis.fetch = async () => {
      return new MockResponse(401, { error: "invalid_client" }) as unknown as Response;
    };
    
    // Verify authentication error is thrown without retry
    await assertRejects(
      async () => {
        await Connection.connect(
          testBaseUrl,
          testTokenUrl,
          testDeviceId,
          testClientId,
          testClientSecret
        );
      },
      AuthenticationError,
      "Invalid Credentials"
    );
  } finally {
    // Restore original methods
    globalThis.WebSocket = originalWebSocket;
    globalThis.fetch = originalFetch;
    globalThis.setTimeout = originalST;
  }
});

// Tests for send method
Deno.test("send should add missing oauthToken and deviceID to data", () => {
  // Create a connection with a mock WebSocket
  const connection = new Connection(
    testBaseUrl, 
    testTokenUrl, 
    testDeviceId, 
    testClientId, 
    testClientSecret
  );
  
  // Set access token
  connection.access_token = testToken;
  
  // Create a mock WebSocket
  const mockWs = new MockWebSocket(testBaseUrl);
  // @ts-ignore - Accessing private property for testing
  connection._socket = mockWs;
  
  // Create test data without oauthToken and deviceID
  const testData = {
    meta: {
      requestID: "test-request-id",
      directive: PlatformDirectives.PlatformApplicationsStaterequest
    },
    payload: { test: true }
  };
  
  // Send the data
  connection.send(testData);
  
  // Verify data was sent with added fields
  assertEquals(mockWs.sentMessages.length, 1);
  
  const sentData = JSON.parse(mockWs.sentMessages[0]);
  assertEquals(sentData.meta.oauthToken, testToken);
  assertEquals(sentData.meta.deviceID, testDeviceId);
  assertEquals(sentData.meta.requestID, "test-request-id");
  assertEquals(sentData.payload.test, true);
});

Deno.test("send should not override existing oauthToken and deviceID", () => {
  // Create a connection with a mock WebSocket
  const connection = new Connection(
    testBaseUrl, 
    testTokenUrl, 
    testDeviceId, 
    testClientId, 
    testClientSecret
  );
  
  // Set access token (this should not be used)
  connection.access_token = testToken;
  
  // Create a mock WebSocket
  const mockWs = new MockWebSocket(testBaseUrl);
  // @ts-ignore - Accessing private property for testing
  connection._socket = mockWs;
  
  // Create test data with existing oauthToken and deviceID
  const customToken = "custom-token";
  const customDeviceId = "custom-device-id";
  const testData = {
    meta: {
      requestID: "test-request-id",
      directive: PlatformDirectives.PlatformApplicationsStaterequest,
      oauthToken: customToken,
      deviceID: customDeviceId
    },
    payload: { test: true }
  };
  
  // Send the data
  connection.send(testData);
  
  // Verify data was sent with original values
  assertEquals(mockWs.sentMessages.length, 1);
  
  const sentData = JSON.parse(mockWs.sentMessages[0]);
  assertEquals(sentData.meta.oauthToken, customToken);
  assertEquals(sentData.meta.deviceID, customDeviceId);
});

Deno.test("send should do nothing if socket is not initialized", () => {
  // Create a connection without initializing socket
  const connection = new Connection(
    testBaseUrl, 
    testTokenUrl, 
    testDeviceId, 
    testClientId, 
    testClientSecret
  );
  
  // Set access token
  connection.access_token = testToken;
  
  // Verify _socket is undefined
  // @ts-ignore - Accessing private property for testing
  assertEquals(connection._socket, undefined);
  
  // Create test data
  const testData = {
    meta: {
      requestID: "test-request-id",
      directive: PlatformDirectives.PlatformApplicationsStaterequest
    },
    payload: { test: true }
  };
  
  // This should not throw an error
  const result = connection.send(testData);
  
  // Result should be undefined because _socket is undefined
  assertEquals(result, undefined);
});

// Tests for sendAndGetResponse method
Deno.test("sendAndGetResponse should throw error if socket is not connected", async () => {
  // Create a connection without initializing socket
  const connection = new Connection(
    testBaseUrl, 
    testTokenUrl, 
    testDeviceId, 
    testClientId, 
    testClientSecret
  );
  
  // Set access token
  connection.access_token = testToken;
  
  // Create test data
  const testData = {
    meta: {
      requestID: "test-request-id",
      directive: PlatformDirectives.PlatformApplicationsStaterequest
    },
    payload: { test: true }
  };
  
  // This should throw an error
  await assertRejects(
    async () => {
      await connection.sendAndGetResponse(testData);
    },
    Error,
    "WebSocket is not connected"
  );
});

Deno.test("sendAndGetResponse should send data and wait for response", async () => {
  // Create a mocked waitFor function to track calls
  let waitForEvent = "";
  let waitForResolveValue: unknown = null;
  let waitForCalled = false;
  
  // Create a connection with a mock WebSocket
  const connection = new Connection(
    testBaseUrl, 
    testTokenUrl, 
    testDeviceId, 
    testClientId, 
    testClientSecret
  );
  
  // Set access token
  connection.access_token = testToken;
  
  // Create a mock WebSocket
  const mockWs = new MockWebSocket(testBaseUrl);
  // @ts-ignore - Accessing private property for testing
  connection._socket = mockWs;
  
  // Mock the waitFor method
  const originalWaitFor = connection.waitFor;
  connection.waitFor = (event: string) => {
    waitForCalled = true;
    waitForEvent = event;
    
    // Create response with OK message code
    const response = {
      meta: {
        requestID: event,
        messageCode: MessageCodes.OK
      },
      payload: { 
        result: "success" 
      }
    };
    
    waitForResolveValue = response;
    return Promise.resolve(response);
  };
  
  try {
    // Create test data with a request ID
    const requestId = "test-request-id-" + Date.now();
    const testData = {
      meta: {
        requestID: requestId,
        directive: PlatformDirectives.PlatformApplicationsStaterequest
      },
      payload: { test: true }
    };
    
    // Call sendAndGetResponse
    const response = await connection.sendAndGetResponse(testData);
    
    // Verify waitFor was called with correct event
    assertEquals(waitForCalled, true);
    assertEquals(waitForEvent, requestId);
    
    // Verify data was sent to WebSocket
    assertEquals(mockWs.sentMessages.length, 1);
    const sentData = JSON.parse(mockWs.sentMessages[0]);
    assertEquals(sentData.meta.requestID, requestId);
    assertEquals(sentData.meta.oauthToken, testToken);
    
    // Verify response was returned
    assertEquals(response, waitForResolveValue);
  } finally {
    // Restore original waitFor
    connection.waitFor = originalWaitFor;
  }
});

Deno.test("sendAndGetResponse should throw PlatformResponseError for critical errors", async () => {
  // Create a connection with a mock WebSocket
  const connection = new Connection(
    testBaseUrl, 
    testTokenUrl, 
    testDeviceId, 
    testClientId, 
    testClientSecret
  );
  
  // Set access token
  connection.access_token = testToken;
  
  // Create a mock WebSocket
  const mockWs = new MockWebSocket(testBaseUrl);
  // @ts-ignore - Accessing private property for testing
  connection._socket = mockWs;
  
  // Mock the waitFor method to return error
  const originalWaitFor = connection.waitFor;
  connection.waitFor = () => {
    // Create response with critical error message code
    const response = {
      meta: {
        requestID: "test-request-id",
        messageCode: MessageCodes.HARDWAREERROR
      },
      payload: { 
        error: "Hardware failure" 
      }
    };
    
    return Promise.resolve(response);
  };
  
  try {
    // Create test data
    const testData = {
      meta: {
        requestID: "test-request-id",
        directive: PlatformDirectives.PlatformApplicationsStaterequest
      },
      payload: { test: true }
    };
    
    // Should throw PlatformResponseError
    await assertRejects(
      async () => {
        await connection.sendAndGetResponse(testData);
      },
      PlatformResponseError,
      "Platform returned status code:"
    );
  } finally {
    // Restore original waitFor
    connection.waitFor = originalWaitFor;
  }
});

Deno.test("sendAndGetResponse should set deviceID if it's null or default", async () => {
  // Create a connection with a mock WebSocket
  const connection = new Connection(
    testBaseUrl, 
    testTokenUrl, 
    testDeviceId, 
    testClientId, 
    testClientSecret
  );
  
  // Set access token
  connection.access_token = testToken;
  
  // Create a mock WebSocket
  const mockWs = new MockWebSocket(testBaseUrl);
  // @ts-ignore - Accessing private property for testing
  connection._socket = mockWs;
  
  // Mock the waitFor method
  const originalWaitFor = connection.waitFor;
  connection.waitFor = () => {
    return Promise.resolve({
      meta: {
        requestID: "test-request-id",
        messageCode: MessageCodes.OK
      }
    });
  };
  
  try {
    // Test with default UUID
    const testData1 = {
      meta: {
        requestID: "test-request-id",
        directive: PlatformDirectives.PlatformApplicationsStaterequest,
        deviceID: "00000000-0000-0000-0000-000000000000"
      },
      payload: { test: true }
    };
    
    await connection.sendAndGetResponse(testData1);
    
    // Verify deviceID was set in sent data
    assertEquals(mockWs.sentMessages.length, 1);
    let sentData = JSON.parse(mockWs.sentMessages[0]);
    assertEquals(sentData.meta.deviceID, testDeviceId);
    
    // Clear sent messages
    mockWs.sentMessages.length = 0;
    
    // Test with null deviceID
    const testData2 = {
      meta: {
        requestID: "test-request-id-2",
        directive: PlatformDirectives.PlatformApplicationsStaterequest,
        deviceID: null
      },
      payload: { test: true }
    };
    
    await connection.sendAndGetResponse(testData2);
    
    // Verify deviceID was set in sent data
    assertEquals(mockWs.sentMessages.length, 1);
    sentData = JSON.parse(mockWs.sentMessages[0]);
    assertEquals(sentData.meta.deviceID, testDeviceId);
  } finally {
    // Restore original waitFor
    connection.waitFor = originalWaitFor;
  }
});

// Tests for close method
Deno.test("close should clear refresher timeout and close socket", () => {
  // Mock clearTimeout
  const originalClearTimeout = globalThis.clearTimeout;
  let timeoutCleared = false;
  const mockTimeoutId = 12345;
  
  try {
    // Set up clearTimeout mock
    globalThis.clearTimeout = (id: number) => {
      if (id === mockTimeoutId) {
        timeoutCleared = true;
      }
    };
    
    // Create connection
    const connection = new Connection(
      testBaseUrl, 
      testTokenUrl, 
      testDeviceId, 
      testClientId, 
      testClientSecret
    );
    
    // Set a mock WebSocket
    const mockWs = new MockWebSocket(testBaseUrl);
    // @ts-ignore - Accessing private property for testing
    connection._socket = mockWs;
    
    // Set a fake refresher
    // @ts-ignore - Accessing private property for testing
    connection._refresher = mockTimeoutId as unknown as ReturnType<typeof setTimeout>;
    
    // Set up a spy to track if the close event emitter is registered
    let closeHandlerRegistered = false;
    const originalOnce = connection.once.bind(connection);
    connection.once = (event: string, listener: (...args: any[]) => void) => {
      if (event === "close") {
        closeHandlerRegistered = true;
      }
      return originalOnce(event, listener) as any;
    };
    
    // Call close
    connection.close();
    
    // Verify timeout was cleared
    assertEquals(timeoutCleared, true);
    
    // Verify socket close was called
    assertEquals(mockWs.readyState, MockWebSocket.CLOSED);
    
    // Verify once handler was registered
    assertEquals(closeHandlerRegistered, true);
    
    // Restore original once method
    connection.once = originalOnce;
  } finally {
    // Restore original clearTimeout
    globalThis.clearTimeout = originalClearTimeout;
  }
});

Deno.test("close should handle missing socket gracefully", () => {
  // Create connection without socket
  const connection = new Connection(
    testBaseUrl, 
    testTokenUrl, 
    testDeviceId, 
    testClientId, 
    testClientSecret
  );
  
  // Verify no socket exists
  // @ts-ignore - Accessing private property for testing
  assertEquals(connection._socket, undefined);
  
  // This should not throw an error
  connection.close();
});

Deno.test("close handler should clean up listeners and socket event handlers", () => {
  // Create connection
  const connection = new Connection(
    testBaseUrl, 
    testTokenUrl, 
    testDeviceId, 
    testClientId, 
    testClientSecret
  );
  
  // Set a mock WebSocket
  const mockWs = new MockWebSocket(testBaseUrl);
  // @ts-ignore - Accessing private property for testing
  connection._socket = mockWs;
  
  // Create a spy for removeAllListeners
  let removeAllListenersCalled = false;
  const originalRemoveAllListeners = connection.removeAllListeners.bind(connection);
  connection.removeAllListeners = () => {
    removeAllListenersCalled = true;
    return originalRemoveAllListeners() as any;
  };
  
  // Call close
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
  
  // Restore original removeAllListeners
  connection.removeAllListeners = originalRemoveAllListeners;
});

// Tests for waitFor method
Deno.test("waitFor should resolve when event is emitted", async () => {
  // Create connection
  const connection = new Connection(
    testBaseUrl, 
    testTokenUrl, 
    testDeviceId, 
    testClientId, 
    testClientSecret
  );
  
  // Create test event name and data
  const testEventName = "test-event";
  const testData = { test: "data" };
  
  // Start waiting for the event
  const waitPromise = connection.waitFor(testEventName);
  
  // Emit the event
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
    testClientSecret
  );
  
  // Create test event name
  const testEventName = "test-event";
  const closeEvent = { type: "close", code: 1000 } as CloseEvent;
  
  // Start waiting for the event
  const waitPromise = connection.waitFor(testEventName);
  
  // Emit the close event
  connection.emit("close", closeEvent);
  
  // Verify promise is rejected with close event
  await assertRejects(
    async () => await waitPromise,
    Error,
    undefined,
    closeEvent
  );
});

Deno.test("waitFor should clean up listeners after resolution", async () => {
  // Create connection
  const connection = new Connection(
    testBaseUrl, 
    testTokenUrl, 
    testDeviceId, 
    testClientId, 
    testClientSecret
  );
  
  // Create test event name
  const testEventName = "test-event";
  
  // Track off calls
  const offCalls: { event: string, listener: any }[] = [];
  const originalOff = connection.off.bind(connection);
  connection.off = (event: string, listener: any) => {
    offCalls.push({ event, listener });
    return originalOff(event, listener) as any;
  };
  
  try {
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
    } catch {
      // Expected to throw
    }
    
    // Verify off was called for the test event
    assertEquals(offCalls.length, 1);
    assertEquals(offCalls[0].event, testEventName);
  } finally {
    // Restore original off
    connection.off = originalOff;
  }
});