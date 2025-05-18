// // Basic usage example of the CUSS2.ts Deno library
//
// import { ComponentState, Cuss2 } from "../mod.ts";
//
// // Configuration (replace with your actual values)
// const config = {
//   platformURL: "wss://cuss-platform-url",
//   oauthURL: "https://oauth-url",
//   deviceID: "00000000-0000-0000-0000-000000000000",
//   clientId: "your-client-id",
//   clientSecret: "your-client-secret",
// };
//
// async function main() {
//   try {
//     console.log("Connecting to CUSS2 platform...");
//
//     // Connect to the CUSS2 platform
//     const cuss2 = await Cuss2.connect(
//       config.platformURL,
//       config.oauthURL,
//       config.deviceID,
//       config.clientId,
//       config.clientSecret,
//     );
//
//     console.log("Connected successfully!");
//
//     // Listen for state changes
//     // First call immediately with current state
//     console.log(`Current state: ${cuss2._currentState.current}`);
//     // Then listen for future changes
//     cuss2.on("stateChange", (stateChange) => {
//       console.log(
//         `State changed from ${stateChange.previous} to ${stateChange.current}`,
//       );
//     });
//
//     // Listen for component state changes
//     // First call with current component if available
//     if (cuss2._currentComponent) {
//       console.log(
//         `Current component ID ${cuss2._currentComponent.id} state: ${cuss2._currentComponent.status}`,
//       );
//     }
//     // Then listen for future changes
//     cuss2.on("componentStateChange", (component) => {
//       if (component) {
//         console.log(
//           `Component ID ${component.id} state changed to ${component.status}`,
//         );
//       }
//     });
//
//     // Check if we have a barcode reader
//     if (cuss2.barcodeReader) {
//       console.log("Barcode reader found. Querying status...");
//
//       // Query the barcode reader
//       const status = await cuss2.barcodeReader.query();
//       console.log("Barcode reader status:", status.meta.componentState);
//
//       // If the barcode reader is ready, enable it and listen for data
//       if (status.meta.componentState === ComponentState.READY) {
//         console.log("Enabling barcode reader...");
//         await cuss2.barcodeReader.enable();
//
//         console.log("Listening for barcode scans...");
//         // Listen for barcode data events
//         cuss2.barcodeReader.on("data", (data) => {
//           console.log("Barcode scanned:", data);
//
//           // Disable the barcode reader after a scan
//           setTimeout(() => {
//             cuss2.barcodeReader.disable();
//             console.log("Barcode reader disabled");
//           }, 1000);
//         });
//       }
//     }
//
//     // Request to transition to UNAVAILABLE state
//     console.log("Requesting UNAVAILABLE state...");
//     await cuss2.requestUnavailableState();
//
//     // Request to transition to AVAILABLE state
//     console.log("Requesting AVAILABLE state...");
//     await cuss2.requestAvailableState();
//
//     console.log("Example running. Press Ctrl+C to exit.");
//   }
//   catch (error) {
//     console.error("Error:", error);
//   }
// }
//
// // Run the example
// if (import.meta.main) {
//   main();
// }
