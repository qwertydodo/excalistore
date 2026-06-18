export type SaveStatus = "idle" | "saving" | "saved" | "error" | "conflict";

export interface AutosaveOptions {
  getHash: () => Promise<string>;
  save: () => Promise<void>;
  onStatus: (status: SaveStatus) => void;
  delayMs?: number;
  pollMs?: number;
  now?: () => number;
}

export interface AutosaveController {
  start: () => void;
  stop: () => void;
  tick: () => Promise<void>;
  flush: () => Promise<void>;
  markSaved: (hash: string) => void;
}

// Debounced autosave: a change must persist for delayMs before we write, so we
// don't spam Drive mid-stroke. Clock + tick are injectable for deterministic
// tests; start() drives tick on a real interval.
export function createAutosave(opts: AutosaveOptions): AutosaveController {
  const delayMs = opts.delayMs ?? 2500;
  const pollMs = opts.pollMs ?? 1000;
  const now = opts.now ?? Date.now;

  let savedHash: string | null = null;
  let dirtySince: number | null = null;
  let saving = false;
  let timer: ReturnType<typeof setInterval> | null = null;

  async function runSave(hash: string): Promise<void> {
    saving = true;
    opts.onStatus("saving");
    try {
      await opts.save();
      savedHash = hash;
      dirtySince = null;
      opts.onStatus("saved");
    } catch (e) {
      opts.onStatus(/conflict/i.test((e as Error).message) ? "conflict" : "error");
    } finally {
      saving = false;
    }
  }

  async function tick(): Promise<void> {
    if (saving) return;
    const hash = await opts.getHash();
    if (savedHash === null) {
      savedHash = hash; // first observation = baseline
      return;
    }
    if (hash === savedHash) {
      dirtySince = null;
      return;
    }
    if (dirtySince === null) dirtySince = now();
    if (now() - dirtySince >= delayMs) await runSave(hash);
  }

  async function flush(): Promise<void> {
    if (saving) return;
    const hash = await opts.getHash();
    if (savedHash !== null && hash !== savedHash) await runSave(hash);
  }

  return {
    start() {
      if (timer === null) timer = setInterval(() => void tick(), pollMs);
    },
    stop() {
      if (timer !== null) {
        clearInterval(timer);
        timer = null;
      }
    },
    tick,
    flush,
    markSaved(hash: string) {
      savedHash = hash;
      dirtySince = null;
    },
  };
}
