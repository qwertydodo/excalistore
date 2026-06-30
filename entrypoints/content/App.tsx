import { ConfirmDialog } from "@/shared/ui";
import { useActiveDiagram } from "./model/useActiveDiagram";
import { useConnectFlow } from "./model/useConnectFlow";
import { useDiagramLibrary } from "./model/useDiagramLibrary";
import { useSignOutFlow } from "./model/useSignOutFlow";
import { ConnectButton } from "./ui/ConnectButton";
import { DiagramPanel } from "./ui/DiagramPanel";

export const App = () => {
  const { status, onStatusChange, files, onFilesChange, isLoading, refresh } = useDiagramLibrary();
  const activeDiagram = useActiveDiagram({ onStatusChange, files, onFilesChange, refresh });
  const signOut = useSignOutFlow({
    activeId: activeDiagram.activeId,
    revisionRef: activeDiagram.revisionRef,
    onActiveIdChange: activeDiagram.onActiveIdChange,
    onStatusChange,
    onActionErrorChange: activeDiagram.onActionErrorChange,
  });
  const connect = useConnectFlow({ refresh, onStatusChange });

  if (!status.isConnected) {
    return (
      <ConnectButton
        isBusy={connect.isConnecting}
        error={connect.connectError}
        onConnect={connect.onConnect}
      />
    );
  }

  return (
    <>
      <DiagramPanel
        files={files}
        isLoading={isLoading}
        onSignOut={signOut.openSignOut}
        diagram={{
          activeId: activeDiagram.activeId,
          saveStatus: activeDiagram.saveStatus,
          error: activeDiagram.actionError,
          onOpen: activeDiagram.onOpen,
          onCreate: activeDiagram.onCreate,
          onRename: activeDiagram.onRename,
          onDelete: activeDiagram.onDelete,
        }}
      />
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
