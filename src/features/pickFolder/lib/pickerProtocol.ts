// Messages exchanged between the popup (embedder) and the sandboxed picker
// iframe. The shared channel tag + a per-pick nonce let each side ignore
// unrelated window messages.
export const PICKER_CHANNEL = "excalistore-picker";

export interface PickedFolder {
  id: string;
  name: string;
}

export type PickerMessage =
  | { channel: typeof PICKER_CHANNEL; type: "picker:ready"; nonce: string }
  | {
      channel: typeof PICKER_CHANNEL;
      type: "picker:open";
      nonce: string;
      token: string;
      apiKey: string;
      appId: string;
    }
  | { channel: typeof PICKER_CHANNEL; type: "picker:picked"; nonce: string; folder: PickedFolder }
  | { channel: typeof PICKER_CHANNEL; type: "picker:cancel"; nonce: string }
  | { channel: typeof PICKER_CHANNEL; type: "picker:error"; nonce: string; message: string };

export function isPickerMessage(value: unknown): value is PickerMessage {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return v.channel === PICKER_CHANNEL && typeof v.type === "string" && typeof v.nonce === "string";
}
