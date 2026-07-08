/* Paylaşım hedefi köprüsü — başka uygulamalardan/görüntüleyiciden gelen içeriği
   (ShareTargetPlugin.java) web tarafına taşır. Web'de / Android dışında no-op. */

import { Capacitor, registerPlugin } from "@capacitor/core";

export interface SharedFile {
  name: string;
  mimeType: string;
  size: number;
  base64?: string;
  tooLarge: boolean;
}

export interface ShareData {
  id: number;
  files: SharedFile[];
  texts: string[];
}

export interface ShareTargetPlugin {
  getPendingShare(): Promise<ShareData>;
  clearPendingShare(): Promise<void>;
  addListener(
    eventName: "shareReceived",
    cb: (data: ShareData) => void
  ): Promise<{ remove: () => Promise<void> }>;
}

export const ShareTarget = registerPlugin<ShareTargetPlugin>("ShareTarget");

export function isNativeShare(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
}
