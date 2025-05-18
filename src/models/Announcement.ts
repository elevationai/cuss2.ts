import { Component } from "./Component.ts";

export class Announcement extends Component {
  say(text: string, lang: string = "en-US") {
    const xml =
      `<?xml version="1.0" encoding="UTF-8"?><speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${lang}">${text}</speak>`;
    return this.play(xml);
  }

  play(xml: string) {
    return this.api.announcement.play(this.id, xml);
  }

  stop() {
    return this.api.announcement.stop(this.id);
  }

  pause() {
    return this.api.announcement.pause(this.id);
  }

  resume() {
    return this.api.announcement.resume(this.id);
  }
}
