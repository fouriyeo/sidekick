import { describe, expect, it } from "vitest";
import rawSheet from "./assets/openpet/pet.json";
import { MANIFEST, parseManifest } from "./sprite-manifest";

type Frame = { col: number; duration: number };

function makeManifest(
  options: {
    cols?: number;
    rows?: number;
    framesPerState?: number;
    states?: Record<string, { row: number; frames?: Frame[]; loop?: { mode: string } }>;
  } = {},
) {
  const cols = options.cols ?? 16;
  const framesPerState = options.framesPerState ?? 16;
  const rows = options.rows ?? 4;
  const states =
    options.states ??
    Object.fromEntries(
      Array.from({ length: rows }, (_, row) => [
        `state-${row}`,
        {
          row,
          frames: Array.from({ length: framesPerState }, (_, col) => ({ col, duration: 100 })),
        },
      ]),
    );

  return {
    schema: 2,
    id: "test-pet",
    image: "spritesheet.webp",
    width: 256,
    height: 256,
    grid: { cell: 256, cols },
    defaultState: Object.keys(states)[0] ?? "idle",
    states,
  };
}

describe("parseManifest", () => {
  it("接受内置的 16 帧四态资产", () => {
    const result = parseManifest(rawSheet);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.manifest.cols).toBe(16);
    expect(result.manifest.cell).toBe(256);
    expect(result.manifest.rows).toBe(4);
    expect(Object.keys(result.manifest.states)).toEqual(["attention", "done", "idle", "working"]);
    expect(result.manifest.states.done?.loop).toBe("once");
    expect(result.manifest.states.idle?.frames).toHaveLength(16);
    expect(MANIFEST?.id).toBe("deepseek");
  });

  it("接受 32 列 / 32 帧的图集", () => {
    const result = parseManifest(makeManifest({ cols: 32, framesPerState: 32 }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.manifest.cols).toBe(32);
    expect(result.manifest.states["state-0"]?.frames).toHaveLength(32);
  });

  it("接受任意多行状态（预留 sleeping/listening 等）", () => {
    const result = parseManifest(
      makeManifest({
        rows: 6,
        states: {
          idle: {
            row: 0,
            frames: Array.from({ length: 16 }, (_, col) => ({ col, duration: 100 })),
          },
          working: {
            row: 1,
            frames: Array.from({ length: 16 }, (_, col) => ({ col, duration: 80 })),
          },
          attention: {
            row: 2,
            frames: Array.from({ length: 16 }, (_, col) => ({ col, duration: 100 })),
          },
          done: {
            row: 3,
            frames: Array.from({ length: 16 }, (_, col) => ({ col, duration: 100 })),
            loop: { mode: "once" },
          },
          sleeping: {
            row: 4,
            frames: Array.from({ length: 8 }, (_, col) => ({ col, duration: 200 })),
          },
          listening: {
            row: 5,
            frames: Array.from({ length: 4 }, (_, col) => ({ col, duration: 150 })),
          },
        },
      }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.manifest.rows).toBe(6);
    expect(result.manifest.states.sleeping?.frames).toHaveLength(8);
    expect(result.manifest.states.listening?.frames).toHaveLength(4);
  });

  it("拒绝超过 32 列", () => {
    const result = parseManifest(makeManifest({ cols: 33, framesPerState: 16 }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.join()).toContain("32");
  });

  it("拒绝帧列越界与重复列", () => {
    const outOfRange = parseManifest(
      makeManifest({
        states: {
          idle: {
            row: 0,
            frames: [{ col: 16, duration: 100 }],
          },
        },
      }),
    );
    expect(outOfRange.ok).toBe(false);

    const duplicated = parseManifest(
      makeManifest({
        states: {
          idle: {
            row: 0,
            frames: [
              { col: 0, duration: 100 },
              { col: 0, duration: 100 },
            ],
          },
        },
      }),
    );
    expect(duplicated.ok).toBe(false);
  });

  it("拒绝空帧、非正时长、找不到 defaultState", () => {
    expect(parseManifest(makeManifest({ states: { idle: { row: 0, frames: [] } } })).ok).toBe(
      false,
    );
    expect(
      parseManifest(
        makeManifest({ states: { idle: { row: 0, frames: [{ col: 0, duration: 0 }] } } }),
      ).ok,
    ).toBe(false);
    expect(
      parseManifest(
        makeManifest({
          states: { idle: { row: 0, frames: [{ col: 0, duration: 100 }] } },
        }),
      ).ok,
    ).toBe(true);

    const missingDefault = {
      ...makeManifest({ states: { idle: { row: 0, frames: [{ col: 0, duration: 100 }] } } }),
      defaultState: "nope",
    };
    expect(parseManifest(missingDefault).ok).toBe(false);
  });

  it("拒绝 cell 与宽高不一致", () => {
    const broken = { ...makeManifest(), width: 512 };
    expect(parseManifest(broken).ok).toBe(false);
  });

  it("拒绝非 schema 2 与空 states", () => {
    expect(parseManifest({ ...makeManifest(), schema: 3 }).ok).toBe(false);
    expect(parseManifest({ ...makeManifest(), states: {} }).ok).toBe(false);
  });
});
