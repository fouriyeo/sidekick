import { create } from "zustand";
import type { ParsedMessage } from "@/protocol/messages";

export type ChatKind = ParsedMessage["kind"];

export type ChatEntry = {
  id: number;
  kind: ChatKind;
  text: string;
};

type ChatStore = {
  messages: ChatEntry[];
  append: (kind: ChatKind, text: string) => void;
  clear: () => void;
};

let nextId = 0;

export const useChatStore = create<ChatStore>((set) => ({
  messages: [],
  append: (kind, text) =>
    set((state) => {
      nextId += 1;
      return { messages: [...state.messages, { id: nextId, kind, text }] };
    }),
  clear: () => set({ messages: [] }),
}));
