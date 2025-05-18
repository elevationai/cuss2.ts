import { Component } from "./component.ts";
import { DeviceType } from "./deviceType.ts";
import { Cuss2 } from "../cuss2.ts";
import { EnvironmentComponent } from "cuss2-typescript-models";

// Define enum for light colors
enum LightColorNameEnum {
  Red = "red",
  Green = "green",
  Blue = "blue",
  Yellow = "yellow",
  White = "white",
}

export class Illumination extends Component {
  constructor(component: EnvironmentComponent, cuss2: Cuss2) {
    super(component, cuss2, DeviceType.ILLUMINATION);
  }

  override async enable(
    duration: number,
    color?: string | number[],
    blink?: number[],
  ) {
    const name = (typeof color === "string")
      ? LightColorNameEnum[color as keyof typeof LightColorNameEnum] || undefined
      : undefined;
    const rgb = (Array.isArray(color) && color.length === 3)
      ? { red: color[0], green: color[1], blue: color[2] }
      : undefined;
    const blinkRate = (Array.isArray(blink) && blink.length === 2)
      ? { durationOn: blink[0], durationOff: blink[1] }
      : undefined;

    if (this.enabled) {
      await this.disable();
    }
    await super.enable();
    return await this.send({
      illuminationData: { duration, lightColor: { name, rgb }, blinkRate },
    });
  }
}
