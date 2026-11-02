import { describe, expect, it } from "vitest";
import { defaultPetState } from "./persistence";
import { createPetSoundGates } from "./pet-store";
import type { PetState } from "./types";

const NOW = new Date(2026, 10, 2, 12, 0, 0, 0).getTime();

function createGates(
  overrides: { pet?: Partial<PetState>; micListening?: boolean; appVisible?: boolean } = {},
) {
  const pet = defaultPetState(NOW);
  // 默认设置里 sound=false；除了「默认关」用例，其余都先打开声音。
  pet.settings = { ...pet.settings, sound: true };
  Object.assign(pet, overrides.pet ?? {});
  const state = { pet, micListening: overrides.micListening ?? false };

  return createPetSoundGates(
    () => state,
    () => overrides.appVisible ?? true,
  );
}

describe("createPetSoundGates 音效门禁接线", () => {
  it("默认设置声音关闭", () => {
    const pet = defaultPetState(NOW);
    const state = { pet, micListening: false };
    const gates = createPetSoundGates(
      () => state,
      () => true,
    );

    expect(gates.enabled()).toBe(false);
  });

  it("声音开 + App 前台 + 宠物页时四个门都打开", () => {
    const gates = createGates();

    expect(gates.enabled()).toBe(true);
    expect(gates.visible()).toBe(true);
    expect(gates.petVisible()).toBe(true);
    expect(gates.micListening()).toBe(false);
  });

  it("打开聊天/设置（overlayOpen）后宠物页门关闭", () => {
    const gates = createGates({ pet: { overlayOpen: true } });

    expect(gates.enabled()).toBe(true);
    expect(gates.petVisible()).toBe(false);
  });

  it("App 切后台（pet.visible=false）后宠物页门关闭", () => {
    const gates = createGates({ pet: { visible: false } });

    expect(gates.petVisible()).toBe(false);
  });

  it("App 不可见时 visible 门关闭", () => {
    const gates = createGates({ appVisible: false });

    expect(gates.visible()).toBe(false);
  });

  it("录音中 micListening 门打开（用于静音）", () => {
    const gates = createGates({ micListening: true });

    expect(gates.micListening()).toBe(true);
  });
});
