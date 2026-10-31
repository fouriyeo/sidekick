import { load, type Store } from "@tauri-apps/plugin-store";
import type { PetSaveV1, PetStorage } from "./types";

export function createTauriPetStorage(fileName = "sidekick-pet.json", key = "pet"): PetStorage {
  let storePromise: Promise<Store> | null = null;

  const getStore = () => {
    storePromise ??= load(fileName, { autoSave: false });
    return storePromise;
  };

  return {
    async load() {
      const store = await getStore();
      const raw = await store.get<unknown>(key);
      return { raw: raw ?? null };
    },
    async save(save: PetSaveV1) {
      const store = await getStore();
      await store.set(key, save);
      await store.save();
    },
    async clear() {
      const store = await getStore();
      await store.delete(key);
      await store.save();
    },
  };
}
