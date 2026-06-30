// Excalidraw binds single-key tool shortcuts on `document`. Key events from our
// Shadow DOM bubble across the boundary and would trigger those shortcuts while
// the user types in the panel's inputs. Stopping keydown/keyup at the shadow
// root's container — the plugin boundary — keeps every key event inside the
// plugin, so no component needs its own per-root handler.
export const scopeKeyboard = (el: HTMLElement): (() => void) => {
  const stop = (e: Event) => e.stopPropagation();
  el.addEventListener("keydown", stop);
  el.addEventListener("keyup", stop);
  return () => {
    el.removeEventListener("keydown", stop);
    el.removeEventListener("keyup", stop);
  };
};
