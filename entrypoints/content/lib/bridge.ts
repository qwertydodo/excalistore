import { defaultSceneBridgeDeps } from "@/features/sceneBridge";

// Single shared scene-bridge instance for the content script. Created once at
// module scope and imported directly by every hook that needs page-storage
// access, rather than re-created per hook or threaded through props.
export const bridge = defaultSceneBridgeDeps();
