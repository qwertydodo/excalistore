import { ConfirmDialog } from "@/shared/ui";
import { useAppInit } from "./model/useAppInit";
import { ConnectButton } from "./ui/ConnectButton";
import { DiagramPanel } from "./ui/DiagramPanel";

export const App = () => {
  const { isStatusLoaded, isPanelInitialized, isQueryLoaded, status, signOut } = useAppInit();

  // Connection status not known yet — painting a guess here just flickers
  // to the real branch a tick later once it resolves.
  if (!isStatusLoaded) {
    return null;
  }

  if (!status.isConnected) {
    return <ConnectButton />;
  }

  // Connected: also need to know panel-collapsed state and the persisted
  // search query before painting, otherwise it flickers between fab and full
  // panel once panel-collapsed resolves, or DiagramPanel mounts its search
  // field before the persisted query has loaded.
  if (!isPanelInitialized || !isQueryLoaded) {
    return null;
  }

  return (
    <>
      <DiagramPanel onSignOut={signOut.openSignOut} />
      {signOut.isSignOutOpen && (
        <ConfirmDialog
          title="Sign out of Excalistore?"
          message="This saves the current diagram to Drive and clears the canvas. Continue?"
          confirmLabel="Save & sign out"
          isDanger
          onConfirm={signOut.doSignOut}
          onCancel={signOut.cancelSignOut}
        />
      )}
    </>
  );
};
