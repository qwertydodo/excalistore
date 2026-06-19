import { ConfirmDialog } from "@/shared/ui";
import { ConnectCard } from "@/widgets/connectCard";
import { DiagramPanel } from "@/widgets/diagramPanel";
import { useActiveDiagram } from "./model/useActiveDiagram";
import { useConnectFlow } from "./model/useConnectFlow";
import { useDiagramLibrary } from "./model/useDiagramLibrary";
import { useSignOutFlow } from "./model/useSignOutFlow";
import { useThemeSync } from "./model/useThemeSync";

export const App = ({ host }: { host: HTMLElement }) => {
  useThemeSync(host);

  const { status, onStatusChange, files, onFilesChange, loading, refresh } = useDiagramLibrary();
  const activeDiagram = useActiveDiagram({ onStatusChange, files, onFilesChange, refresh });
  const signOut = useSignOutFlow({
    activeId: activeDiagram.activeId,
    revisionRef: activeDiagram.revisionRef,
    onActiveIdChange: activeDiagram.onActiveIdChange,
    onStatusChange,
    onActionErrorChange: activeDiagram.onActionErrorChange,
  });
  const connect = useConnectFlow({ refresh, onStatusChange });

  if (!status.connected) {
    return (
      <ConnectCard
        busy={connect.connecting}
        error={connect.connectError}
        onConnect={connect.onConnect}
      />
    );
  }

  return (
    <>
      <DiagramPanel
        diagram={{
          files,
          loading,
          activeId: activeDiagram.activeId,
          saveStatus: activeDiagram.saveStatus,
          collapsed: activeDiagram.collapsed,
          error: activeDiagram.actionError,
          onOpen: activeDiagram.onOpen,
          onCreate: activeDiagram.onCreate,
          onRename: activeDiagram.onRename,
          onSignOut: signOut.openSignOut,
          onToggleCollapse: activeDiagram.toggleCollapsed,
        }}
      />
      {signOut.signOutOpen && (
        <ConfirmDialog
          title="Sign out of Excalistore?"
          message="This saves the current diagram to Drive and clears the canvas. Continue?"
          confirmLabel="Save & sign out"
          danger
          onConfirm={signOut.doSignOut}
          onCancel={signOut.cancelSignOut}
        />
      )}
    </>
  );
};
