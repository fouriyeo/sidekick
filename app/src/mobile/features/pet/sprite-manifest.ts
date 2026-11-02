import rawManifest from "./assets/openpet/pet.json";
import posterUrl from "./assets/openpet/poster.webp";
import sheetUrl from "./assets/openpet/spritesheet.webp";

/**
 * 内置宠物的图集与海报。换资产时只改 assets/openpet/ 下的两个文件；
 * manifest 由 `parseManifest` 校验，非法时整只宠物降级为 poster。
 */
export const PET_SHEET_URL = sheetUrl;
export const PET_POSTER_URL = posterUrl;

/** 单个状态最多 32 帧（当前资产是 16 帧），一列一帧。 */
export const MAX_SPRITE_FRAMES = 32;
/** 图集最多 32 列；行数由 manifest 声明、解码后的图片高度决定。 */
export const MAX_SPRITE_COLS = 32;

export type SpriteFrame = {
  col: number;
  duration: number;
};

export type SpriteLoopMode = "loop" | "once";

export type SpriteState = {
  name: string;
  /** 图集里的行号；以后加状态行只需要在 manifest 里登记。 */
  row: number;
  frames: SpriteFrame[];
  loop: SpriteLoopMode;
};

export type PetManifest = {
  schema: 2;
  id: string;
  label: string | null;
  image: string;
  /** 单元格边长（当前 256）；换成 512 的高清图集也不用改渲染器。 */
  cell: number;
  cols: number;
  /** 声明的状态行数（max(row) + 1）；实际图集高度以解码结果为准。 */
  rows: number;
  defaultState: string;
  states: Record<string, SpriteState>;
};

export type ManifestParseResult =
  | { ok: true; manifest: PetManifest }
  | { ok: false; errors: string[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toInt(value: unknown, min: number): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || !Number.isInteger(value)) {
    return null;
  }
  return value >= min ? value : null;
}

function parseLoop(value: unknown, name: string, errors: string[]): SpriteLoopMode {
  if (value === undefined) return "loop";
  if (!isRecord(value)) {
    errors.push(`states.${name}.loop 必须是对象`);
    return "loop";
  }
  if (value.mode === undefined) return "loop";
  if (value.mode === "loop" || value.mode === "once") return value.mode;
  errors.push(`states.${name}.loop.mode 只能是 loop 或 once`);
  return "loop";
}

/**
 * 严格校验 manifest。只认 `schema 2`：state 名任意、行号不要求连续、
 * 每个状态帧数 1–32 且不超过 cols；`transitions` 保留但不执行。
 */
export function parseManifest(input: unknown): ManifestParseResult {
  const errors: string[] = [];
  if (!isRecord(input)) return { ok: false, errors: ["manifest 不是对象"] };

  if (input.schema !== 2) errors.push("schema 必须是 2");

  const width = toInt(input.width, 1);
  const height = toInt(input.height, 1);
  const grid = isRecord(input.grid) ? input.grid : null;
  const cell = grid ? toInt(grid.cell, 1) : null;
  const cols = grid ? toInt(grid.cols, 1) : null;

  if (width === null) errors.push("width 必须是正整数");
  if (height === null) errors.push("height 必须是正整数");
  if (cell === null) errors.push("grid.cell 必须是正整数");
  if (cols === null) errors.push("grid.cols 必须是正整数");
  else if (cols > MAX_SPRITE_COLS) errors.push(`grid.cols 不能超过 ${MAX_SPRITE_COLS}`);

  if (cell !== null && width !== null && height !== null) {
    if (cell !== width || cell !== height) errors.push("width/height 必须等于 grid.cell");
  }

  const image = typeof input.image === "string" && input.image.length > 0 ? input.image : null;
  if (!image) errors.push("image 必须是非空字符串");

  const statesRaw = isRecord(input.states) ? input.states : null;
  const states: Record<string, SpriteState> = {};
  let rows = 0;

  if (!statesRaw || Object.keys(statesRaw).length === 0) {
    errors.push("states 不能为空");
  } else {
    for (const [name, raw] of Object.entries(statesRaw)) {
      if (!isRecord(raw)) {
        errors.push(`states.${name} 不是对象`);
        continue;
      }

      const row = toInt(raw.row, 0);
      if (row === null) {
        errors.push(`states.${name}.row 必须是 ≥0 的整数`);
        continue;
      }
      rows = Math.max(rows, row + 1);

      if (!Array.isArray(raw.frames) || raw.frames.length === 0) {
        errors.push(`states.${name}.frames 不能为空`);
        continue;
      }
      if (raw.frames.length > MAX_SPRITE_FRAMES) {
        errors.push(`states.${name} 帧数不能超过 ${MAX_SPRITE_FRAMES}`);
      }
      if (cols !== null && raw.frames.length > cols) {
        errors.push(`states.${name} 帧数(${raw.frames.length}) 超过列数(${cols})`);
      }

      const seen = new Set<number>();
      const frames: SpriteFrame[] = [];
      raw.frames.forEach((frame, index) => {
        if (!isRecord(frame)) {
          errors.push(`states.${name}.frames[${index}] 不是对象`);
          return;
        }
        const col = toInt(frame.col, 0);
        const duration =
          typeof frame.duration === "number" &&
          Number.isFinite(frame.duration) &&
          frame.duration > 0
            ? frame.duration
            : null;
        if (col === null) {
          errors.push(`states.${name}.frames[${index}].col 必须是 ≥0 的整数`);
          return;
        }
        if (cols !== null && col >= cols) {
          errors.push(`states.${name}.frames[${index}].col 超出列数(${cols})`);
          return;
        }
        if (duration === null) {
          errors.push(`states.${name}.frames[${index}].duration 必须是正数`);
          return;
        }
        if (seen.has(col)) {
          errors.push(`states.${name}.frames 里 col=${col} 重复`);
          return;
        }
        seen.add(col);
        frames.push({ col, duration });
      });

      states[name] = {
        name,
        row,
        frames,
        loop: parseLoop(raw.loop, name, errors),
      };
    }
  }

  const defaultState =
    typeof input.defaultState === "string" && input.defaultState.length > 0
      ? input.defaultState
      : "idle";
  if (!states[defaultState]) errors.push(`defaultState(${defaultState}) 未在 states 中声明`);

  const label = typeof input.label === "string" && input.label.length > 0 ? input.label : null;

  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    manifest: {
      schema: 2,
      id: typeof input.id === "string" && input.id.length > 0 ? input.id : "pet",
      label,
      image: image as string,
      cell: cell as number,
      cols: cols as number,
      rows,
      defaultState,
      states,
    },
  };
}

const parsed = parseManifest(rawManifest);

export const MANIFEST: PetManifest | null = parsed.ok ? parsed.manifest : null;
export const MANIFEST_ERRORS: string[] = parsed.ok ? [] : parsed.errors;

if (!parsed.ok && import.meta.env.DEV) {
  console.warn("[sprite] manifest 校验失败，宠物将降级为静态海报：", parsed.errors);
}
