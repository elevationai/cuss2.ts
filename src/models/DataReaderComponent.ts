import { Component } from "./component.ts";
import {
  DataRecord,
  MessageCodes,
  PlatformData,
} from "cuss2-typescript-models";
import { DeviceType } from "./deviceType.ts";
import { Cuss2 } from "../cuss2.ts";
import { EnvironmentComponent } from "cuss2-typescript-models";

export class DataReaderComponent extends Component {
  previousData: string[] = [];

  override _handleMessage(data: PlatformData) {
    this.emit("message", data);
    if (
      data?.meta?.messageCode === MessageCodes.DATAPRESENT &&
      data?.payload?.dataRecords?.length
    ) {
      this.previousData = data?.payload?.dataRecords?.map((dr: DataRecord) => dr?.data || "") as string[];
      this.emit("data", this.previousData);
    }
  }

  async read(ms: number = 30000) {
    return new Promise(async (resolve, reject) => {
      await this.enable();

      // Create a timeout
      const timeoutId = setTimeout(() => {
        this.off("data", dataHandler);
        reject(new Error(`Timeout of ${ms}ms exceeded`));
      }, ms);

      // Set up a one-time data handler
      const dataHandler = (data: string[]) => {
        clearTimeout(timeoutId);
        resolve(data);
      };

      this.once("data", dataHandler);
    })
      .finally(() => this.disable());
  }
}