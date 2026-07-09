import { useShallow } from "zustand/react/shallow";
import { SearchField, Stack, Text } from "@/shared/ui";
import { useActiveDiagramStore } from "../../model/stores/activeDiagramStore";
import { useDiagramData } from "../../model/useDiagramData";
import { DiagramRow } from "../DiagramRow";
import styles from "./DiagramList.module.css";

type DiagramListProps = {
  areRowsLocked: boolean;
  openingId: string | null;
  onRowOpen: (id: string) => void;
};

// Only mounted once the diagram library's persisted search query has
// resolved (see DiagramPanel's isLoading gate) — useDiagramData delays
// mounting useTextSearch until that's true, so it never adopts a
// later-arriving initialQuery.
export const DiagramList = ({ areRowsLocked, openingId, onRowOpen }: DiagramListProps) => {
  const { query, onQueryChange, results, hasDiagrams } = useDiagramData();
  const { activeId, onRename, onDelete } = useActiveDiagramStore(
    useShallow((s) => ({ activeId: s.activeId, onRename: s.onRename, onDelete: s.onDelete })),
  );

  return (
    <>
      <SearchField
        name="diagram-search"
        value={query}
        onChange={onQueryChange}
        placeholder="Type 3+ characters to search"
        aria-label="Search diagrams"
      />

      {results.length === 0 ? (
        <Stack align="center">
          {hasDiagrams ? (
            <Text size="sm" color="muted">
              No diagrams match "{query}"
            </Text>
          ) : (
            <Text size="sm" color="muted">
              No diagrams yet
            </Text>
          )}
        </Stack>
      ) : (
        <Stack as="ul" gap="1" className={styles.list}>
          {results.map((f) => (
            <DiagramRow
              key={f.id}
              file={f}
              isActive={f.id === activeId}
              isLocked={areRowsLocked}
              isOpening={openingId === f.id}
              onOpen={onRowOpen}
              onRename={onRename}
              onDelete={onDelete}
            />
          ))}
        </Stack>
      )}
    </>
  );
};
