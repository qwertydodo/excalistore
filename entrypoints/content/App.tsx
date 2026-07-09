import { ConfirmDialog } from "@/shared/ui";
import { useAppInit } from "./model/useAppInit";
import { ConnectButton } from "./ui/ConnectButton";
import { DiagramPanel } from "./ui/DiagramPanel";
import { DiagramWatchers } from "./ui/DiagramWatchers";

export const App = () => {
  const { isStatusLoaded, isPanelReady, isQueryReady, isListReady, isReconciled, status, signOut } =
    useAppInit();

  // Connection status not known yet — painting a guess here just flickers
  // to the real branch a tick later once it resolves.
  if (!isStatusLoaded) {
    return null;
  }

  if (!status.isConnected) {
    return <ConnectButton />;
  }

  // Fresh session: wait for the first real Drive list (cache is only trusted
  // across same-tab navigation reloads). Reload sessions pass instantly.
  if (!isPanelReady || !isQueryReady || !isListReady) {
    return null;
  }

  return (
    <>
      <DiagramPanel onSignOut={signOut.openSignOut} />
      {isReconciled && <DiagramWatchers />}
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
