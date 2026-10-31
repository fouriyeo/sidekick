import { create } from "zustand";

export type ChatKind = "me" | "them" | "system";

export type ChatEntry = {
  id: number;
  kind: ChatKind;
  text: string;
};

export type ChatState = {
  messages: ChatEntry[];
  nextId: number;
  append: (kind: ChatKind, text: string) => void;
};

export const useChatStore = create<ChatState>((set) => ({
  messages: [],
  nextId: 1,

  append: (kind, text) =>
    set((state) => ({
      messages: [...state.messages, { id: state.nextId, kind, text }],
      nextId: state.nextId + 1,
    })),
}));
