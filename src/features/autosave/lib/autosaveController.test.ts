import { describe, expect, it, vi } from "vitest";
import { createAutosave } from "./autosaveController";

function setup(over: Partial<Parameters<typeof createAutosave>[0]> = {}) {
  let clock = 0;
  const statuses: string[] = [];
  const ctrl = createAutosave({
    getHash: vi.fn(async () => "h0"),
    save: vi.fn(async () => undefined),
    onStatus: (s) => statuses.push(s),
    delayMs: 2500,
    pollMs: 1000,
    now: () => clock,
    ...over,
  });
  return { ctrl, statuses, advance: (ms: number) => (clock += ms) };
}

describe("createAutosave", () => {
  it("does not save while the scene is unchanged", async () => {
    const save = vi.fn(async () => undefined);
    const { ctrl } = setup({ getHash: vi.fn(async () => "same"), save });
    ctrl.start();
    await ctrl.tick();
    await ctrl.tick();
    expect(save).not.toHaveBeenCalled();
    ctrl.stop();
  });

  it("saves after the scene stays changed for the debounce window", async () => {
    const save = vi.fn(async () => undefined);
    const getHash = vi.fn(async () => "h1"); // differs from baseline h0
    const { ctrl, statuses, advance } = setup({ getHash, save });
    ctrl.markSaved("h0"); // baseline
    await ctrl.tick(); // sees change at t=0, starts the debounce
    expect(save).not.toHaveBeenCalled();
    advance(2500);
    await ctrl.tick(); // debounce elapsed → save
    expect(save).toHaveBeenCalledOnce();
    expect(statuses).toContain("saving");
    expect(statuses).toContain("saved");
  });

  it("reports conflict status when save throws a conflict", async () => {
    const save = vi.fn(async () => {
      throw new Error("conflict: remote revision changed");
    });
    const { ctrl, statuses, advance } = setup({ getHash: vi.fn(async () => "h1"), save });
    ctrl.markSaved("h0");
    await ctrl.tick();
    advance(2500);
    await ctrl.tick();
    expect(statuses).toContain("conflict");
    expect(statuses).not.toContain("saved");
  });

  it("reports error status on a generic failure", async () => {
    const save = vi.fn(async () => {
      throw new Error("network down");
    });
    const { ctrl, statuses, advance } = setup({ getHash: vi.fn(async () => "h1"), save });
    ctrl.markSaved("h0");
    await ctrl.tick();
    advance(2500);
    await ctrl.tick();
    expect(statuses).toContain("error");
  });

  it("flush() saves immediately when dirty", async () => {
    const save = vi.fn(async () => undefined);
    const { ctrl } = setup({ getHash: vi.fn(async () => "h1"), save });
    ctrl.markSaved("h0");
    await ctrl.flush();
    expect(save).toHaveBeenCalledOnce();
  });

  it("flush() is a no-op when clean", async () => {
    const save = vi.fn(async () => undefined);
    const { ctrl } = setup({ getHash: vi.fn(async () => "h0"), save });
    ctrl.markSaved("h0");
    await ctrl.flush();
    expect(save).not.toHaveBeenCalled();
  });
});
