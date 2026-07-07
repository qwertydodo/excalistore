import { ConfirmDialog } from "@/shared/ui";
import { useActiveDiagram } from "./model/useActiveDiagram";
import { useDiagramLibrary } from "./model/useDiagramLibrary";
import { useSignOutFlow } from "./model/useSignOutFlow";
import { ConnectButton } from "./ui/ConnectButton";
import { DiagramPanel } from "./ui/DiagramPanel";

export const App = () => {
  const { status } = useDiagramLibrary();
  useActiveDiagram();
  const signOut = useSignOutFlow();

  if (!status.isConnected) {
    return <ConnectButton />;
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
