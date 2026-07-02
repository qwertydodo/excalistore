import type { ValueOf } from "@/shared/lib";

export const SAVE_STATUS = {
  IDLE: "idle",
  SAVING: "saving",
  SAVED: "saved",
  ERROR: "error",
  CONFLICT: "conflict",
} as const;

export type SaveStatus = ValueOf<typeof SAVE_STATUS>;

export type AutosaveOptions = {
  getHash: () => Promise<string>;
  save: () => Promise<void>;
  onStatus: (status: SaveStatus) => void;
  delayMs?: number;
  pollMs?: number;
  now?: () => number;
};

export type AutosaveController = {
  start: () => void;
  stop: () => void;
  tick: () => Promise<void>;
  flush: () => Promise<void>;
  markSaved: (hash: string) => void;
};

// Debounced autosave: a change must persist for delayMs before we write, so we
// don't spam Drive mid-stroke. Clock + tick are injectable for deterministic
// tests; start() drives tick on a real interval.
export const createAutosave = (opts: AutosaveOptions): AutosaveController => {
  const delayMs = opts.delayMs ?? 2500;
  const pollMs = opts.pollMs ?? 1000;
  const now = opts.now ?? Date.now;

  let savedHash: string | null = null;
  let dirtySince: number | null = null;
  let isSaving = false;
  let timer: ReturnType<typeof setInterval> | null = null;

  const runSave = async (hash: string): Promise<void> => {
    isSaving = true;
    opts.onStatus(SAVE_STATUS.SAVING);
    try {
      await opts.save();
      savedHash = hash;
      dirtySince = null;
      opts.onStatus(SAVE_STATUS.SAVED);
    } catch (e) {
      opts.onStatus(
        /conflict/i.test((e as Error).message) ? SAVE_STATUS.CONFLICT : SAVE_STATUS.ERROR,
      );
    } finally {
      isSaving = false;
    }
  };

  const tick = async (): Promise<void> => {
    if (isSaving) return;
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
  };

  const flush = async (): Promise<void> => {
    if (isSaving) return;
    const hash = await opts.getHash();
    if (savedHash !== null && hash !== savedHash) await runSave(hash);
  };

  return {
    start() {
      if (timer === null)
        timer = setInterval(() => {
          tick();
        }, pollMs);
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
};
