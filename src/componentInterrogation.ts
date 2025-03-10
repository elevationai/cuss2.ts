/*
==============================================================================
 Project: CUSS2.js
 Company: VisionBox
 License: MIT License
 Last Updated: 2024-09-26
==============================================================================
*/

import { MessageCodes } from 'cuss2-typescript-models';
import {
	ComponentCharacteristics,
	ComponentTypes,
	CUSSDataTypes,
	DeviceTypes,
	EnvironmentComponent,
	MediaTypes
} from "cuss2-typescript-models";

export { EnvironmentComponent, MediaTypes };

const dsTypesHas = (charac0:ComponentCharacteristics, type: CUSSDataTypes) => {
	return charac0?.dsTypesList?.find((d) => d === type);
}
const mediaTypesHas = (mediaTypes:MediaTypes[], type: MediaTypes) => {
	return mediaTypes?.find((m) => m === type);
}

const deviceTypesHas = (deviceTypes: DeviceTypes[] | undefined, type: DeviceTypes) => {
	return deviceTypes?.find((m) => m === type);
}

export class ComponentInterrogation {
	static isAnnouncement = (component:EnvironmentComponent) => {
		return component.componentType === ComponentTypes.ANNOUNCEMENT;
	}

	static isFeeder = (component:EnvironmentComponent) => {
		return component.componentType === ComponentTypes.FEEDER;
	}

	static isDispenser = (component:EnvironmentComponent) => {
		return component.componentType === ComponentTypes.DISPENSER;
	}

	static isBagTagPrinter = (component:EnvironmentComponent) => {
		const charac0 = component.componentCharacteristics?.[0];
		if (!charac0) return;
		const mediaTypes = charac0.mediaTypesList;
		return deviceTypesHas(charac0.deviceTypesList, DeviceTypes.PRINT) && mediaTypesHas(mediaTypes, MediaTypes.BAGGAGETAG);
	}

	static isBoardingPassPrinter = (component:EnvironmentComponent) => {
		const charac0 = component.componentCharacteristics?.[0];
		if (!charac0) return;
		const mediaTypes = charac0.mediaTypesList;
		return deviceTypesHas(charac0.deviceTypesList, DeviceTypes.PRINT) && mediaTypesHas(mediaTypes, MediaTypes.BOARDINGPASS);
	}

	static isDocumentReader = (component:EnvironmentComponent) => {
		const charac0 = component.componentCharacteristics?.[0];
		if (!charac0) return;
		const mediaTypes = charac0.mediaTypesList;
		return mediaTypesHas(mediaTypes, MediaTypes.PASSPORT);
	}

	static isBarcodeReader = (component:EnvironmentComponent) => {
		const charac0 = component.componentCharacteristics?.[0];
		if (!charac0) return;
		return dsTypesHas(charac0, CUSSDataTypes.BARCODE);
	}

	static isCardReader = (component:EnvironmentComponent) => {
		const charac0 = component.componentCharacteristics?.[0];
		if (!charac0) return;
		const mediaTypes = charac0.mediaTypesList;
		return mediaTypesHas(mediaTypes, MediaTypes.MAGCARD);
	}

	static isKeypad = (component:EnvironmentComponent) => {
		const charac0 = component.componentCharacteristics?.[0];
		if (!charac0) return;
		return dsTypesHas(charac0, CUSSDataTypes.KEY) || dsTypesHas(charac0, CUSSDataTypes.KEYUP) || dsTypesHas(charac0, CUSSDataTypes.KEYDOWN);
	}

	static isIllumination = (component:EnvironmentComponent) => {
		const charac0 = component.componentCharacteristics?.[0];
		if (!charac0) return;
		return deviceTypesHas(charac0.deviceTypesList, DeviceTypes.ILLUMINATION);
	}

	static isHeadset = (component:EnvironmentComponent) => {
		if (component.componentType !== ComponentTypes.MEDIAINPUT) return;
		const charac0 = component.componentCharacteristics?.[0];
		if (!charac0) return;
		const mediaTypes = charac0.mediaTypesList;
		return deviceTypesHas(charac0.deviceTypesList, DeviceTypes.ASSISTIVE) && mediaTypesHas(mediaTypes, MediaTypes.AUDIO);
	}

	static isScale = (component:EnvironmentComponent) => {
		if (component.componentType !== ComponentTypes.DATAINPUT) return;
		const charac0 = component.componentCharacteristics?.[0];
		if (!charac0) return;
		return deviceTypesHas(charac0.deviceTypesList, DeviceTypes.SCALE);
	}
	static isBiometric = (component:EnvironmentComponent) => {
		//return component.componentDescription === 'Face Reader';
		const charac0 = component.componentCharacteristics?.[0];
		if (!charac0) return;
		return dsTypesHas(charac0, CUSSDataTypes.BIOMETRIC);
	}
	static isCamera = (component: EnvironmentComponent) => {
		if (component.componentType !== ComponentTypes.DATAINPUT) return;
		const charac0 = component.componentCharacteristics?.[0];
		if (!charac0) return;
		const mediaTypes = charac0.mediaTypesList;
		return deviceTypesHas(charac0.deviceTypesList, DeviceTypes.CAMERA) && mediaTypesHas(mediaTypes, MediaTypes.IMAGE);
	}

	static isRFIDReader = (component: EnvironmentComponent): boolean => {
		if (component.componentType !== ComponentTypes.DATAINPUT) return;
		const charac0 = component.componentCharacteristics?.[0];
		if (!charac0) return;
		const mediaTypes = charac0.mediaTypesList;
		return !!deviceTypesHas(charac0.deviceTypesList, DeviceTypes.CONTACTLESS) && !!mediaTypesHas(mediaTypes, MediaTypes.RFID);
	}

	static isInsertionBelt = (component: EnvironmentComponent): boolean => {
		const charac0 = component.componentCharacteristics?.[0];
		if (!charac0) return;
		return component.componentType == ComponentTypes.INSERTIONBELT;
	}

	static isVerificationBelt = (component: EnvironmentComponent): boolean => {
		const charac0 = component.componentCharacteristics?.[0];
		if (!charac0) return;
		return component.componentType == ComponentTypes.VERIFICATIONBELT;
	}

	static isParkingBelt = (component: EnvironmentComponent): boolean => {
		const charac0 = component.componentCharacteristics?.[0];
		if (!charac0) return;
		return component.componentType == ComponentTypes.PARKINGBELT
	}
}
