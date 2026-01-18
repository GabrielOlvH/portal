import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { createId } from '@/lib/defaults';
import type { Snippet } from '@/lib/types';

const SNIPPETS_KEY = 'tmux.snippets.v1';

const DEFAULT_SNIPPETS: Omit<Snippet, 'id'>[] = [
  { label: 'Claude', command: 'claude --permission-mode bypassPermissions', providerIcon: 'claude' },
  { label: 'Codex', command: 'codex --yolo', providerIcon: 'codex' },
  { label: 'OpenCode', command: 'opencode' },
];

function buildDefaultSnippets(): Snippet[] {
  return DEFAULT_SNIPPETS.map((snippet) => ({
    id: createId('snippet'),
    ...snippet,
  }));
}

async function loadSnippets(): Promise<Snippet[]> {
  const raw = await AsyncStorage.getItem(SNIPPETS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as Snippet[];
  } catch {
    return [];
  }
}

async function saveSnippets(snippets: Snippet[]): Promise<void> {
  await AsyncStorage.setItem(SNIPPETS_KEY, JSON.stringify(snippets));
}

const SnippetsContext = createContext<{
  snippets: Snippet[];
  ready: boolean;
  addSnippet: (label: string, command: string) => Promise<void>;
  updateSnippet: (snippetId: string, updates: Partial<Snippet>) => Promise<void>;
  removeSnippet: (snippetId: string) => Promise<void>;
} | null>(null);

export function SnippetsProvider({ children }: { children: React.ReactNode }) {
  const [snippets, setSnippets] = useState<Snippet[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let mounted = true;
    async function load() {
      const storedSnippets = await loadSnippets();
      const initialSnippets = storedSnippets.length > 0 ? storedSnippets : buildDefaultSnippets();
      if (!mounted) return;
      setSnippets(initialSnippets);
      if (storedSnippets.length === 0) {
        await saveSnippets(initialSnippets);
      }
      setReady(true);
    }
    load();
    return () => {
      mounted = false;
    };
  }, []);

  const persistSnippets = useCallback(async (nextSnippets: Snippet[]) => {
    setSnippets(nextSnippets);
    await saveSnippets(nextSnippets);
  }, []);

  const addSnippet = useCallback(
    async (label: string, command: string) => {
      const newSnippet: Snippet = { id: createId('snippet'), label, command };
      await persistSnippets([...snippets, newSnippet]);
    },
    [snippets, persistSnippets]
  );

  const updateSnippet = useCallback(
    async (snippetId: string, updates: Partial<Snippet>) => {
      const nextSnippets = snippets.map((snippet) =>
        snippet.id === snippetId ? { ...snippet, ...updates } : snippet
      );
      await persistSnippets(nextSnippets);
    },
    [snippets, persistSnippets]
  );

  const removeSnippet = useCallback(
    async (snippetId: string) => {
      const nextSnippets = snippets.filter((snippet) => snippet.id !== snippetId);
      await persistSnippets(nextSnippets);
    },
    [snippets, persistSnippets]
  );

  const value = useMemo(
    () => ({
      snippets,
      ready,
      addSnippet,
      updateSnippet,
      removeSnippet,
    }),
    [snippets, ready, addSnippet, updateSnippet, removeSnippet]
  );

  return <SnippetsContext.Provider value={value}>{children}</SnippetsContext.Provider>;
}

export function useSnippets() {
  const context = useContext(SnippetsContext);
  if (!context) {
    throw new Error('useSnippets must be used within SnippetsProvider');
  }
  return context;
}
