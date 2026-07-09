import { useAutoCreate } from "../../model/useAutoCreate";
import { useAutosave } from "../../model/useAutosave";

// Renderless mount point for the save/auto-create watchers. App only renders
// it once connected + reconciled, so the hooks need no guards of their own —
// unmounting on disconnect IS the cleanup path.
export const DiagramWatchers = () => {
  useAutosave();
  useAutoCreate();
  return null;
};
