// Base component classes
export { Component } from "./Component.ts";
export { DataReaderComponent } from "./DataReaderComponent.ts";

// Reader components
export { BarcodeReader } from "./BarcodeReader.ts";
export { DocumentReader } from "./DocumentReader.ts";
export { CardReader } from "./CardReader.ts";
export { Scale } from "./Scale.ts";
export { RFID } from "./RFID.ts";
export { Camera } from "./Camera.ts";
export { AEASBD } from "./AEASBD.ts";
export { BHS } from "./BHS.ts";

// Printer components
export { Printer } from "./Printer.ts";
export { BagTagPrinter } from "./BagTagPrinter.ts";
export { BoardingPassPrinter } from "./BoardingPassPrinter.ts";
export { Feeder } from "./Feeder.ts";
export { Dispenser } from "./Dispenser.ts";

// Input/Output components
export { Keypad } from "./Keypad.ts";
export { Announcement } from "./Announcement.ts";
export { Illumination } from "./Illumination.ts";
export { Headset } from "./Headset.ts";
export { Biometric } from "./Biometric.ts";

// Belt components
export { InsertionBelt } from "./InsertionBelt.ts";
export { VerificationBelt } from "./VerificationBelt.ts";
export { ParkingBelt } from "./ParkingBelt.ts";

// Types
export { DeviceType } from "./deviceType.ts";
export { PlatformResponseError } from "./platformResponseError.ts";

// Re-export types from the models
export type { DataRecord, EnvironmentComponent, PlatformData } from "cuss2-typescript-models";

export { ComponentState, CUSSDataTypes, MessageCodes, PlatformDirectives } from "cuss2-typescript-models";
