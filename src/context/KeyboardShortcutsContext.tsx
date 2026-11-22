import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

const SHORTCUTS_ENABLED_STORAGE_KEY = 'dd_shortcuts_enabled';
const CHORD_TIMEOUT_MS = 1100;
const ANNOUNCEMENT_DURATION_MS = 1500;

export type ShortcutCategory = 'navigation' | 'workspace' | 'reference';

export interface KeyCombo {
  readonly key: string;
  readonly mod?: boolean;
  readonly alt?: boolean;
  readonly shift?: boolean;
}

export interface ShortcutDefinition {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly category: ShortcutCategory;
  /** Display key labels, e.g. ['G', 'O'] or ['Ctrl/⌘', 'B'] */
  readonly keys: readonly string[];
  /** Whether keys represent a sequential chord ("G then O") vs simultaneous combo */
  readonly keyJoiner?: 'then' | '+';
  /** Optional secondary display hint, e.g. "or G 0" */
  readonly alternateHint?: string;
  /** Primary two-key chord sequence (lowercase), e.g. ['g', 'o'] */
  readonly sequence?: readonly [string, string];
  /** Optional alternate two-key chord sequence, e.g. ['g', '0'] */
  readonly altSequence?: readonly [string, string];
  /** Primary single-key or modifier combo */
  readonly combo?: KeyCombo;
  /** Optional alternate single-key or modifier combo */
  readonly altCombo?: KeyCombo;
  /** Allow triggering even when global navigation shortcuts are paused */
  readonly allowWhenDisabled?: boolean;
  /** Feedback message shown briefly and announced to screen readers */
  readonly announcement?: string;
  readonly handler: () => void;
}

export interface ShortcutAnnouncement {
  readonly id: number;
  readonly message: string;
  readonly keys: readonly string[];
  readonly keyJoiner: 'then' | '+';
}

export interface KeyboardShortcutsContextValue {
  readonly shortcuts: readonly ShortcutDefinition[];
  readonly enabled: boolean;
  readonly setEnabled: (next: boolean) => void;
  readonly helpOpen: boolean;
  readonly openHelp: () => void;
  readonly closeHelp: () => void;
  readonly toggleHelp: () => void;
  readonly pendingPrefix: string | null;
  readonly cancelPendingPrefix: () => void;
  readonly lastAnnouncement: ShortcutAnnouncement | null;
  readonly registerShortcuts: (
    definitions: readonly ShortcutDefinition[],
  ) => () => void;
  readonly executeShortcut: (id: string) => void;
}

const KeyboardShortcutsContext =
  createContext<KeyboardShortcutsContextValue | null>(null);

function readShortcutsEnabledPreference(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    const raw = window.localStorage.getItem(SHORTCUTS_ENABLED_STORAGE_KEY);
    return raw === null ? true : raw !== 'false';
  } catch {
    return true;
  }
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
    return true;
  }
  if (target.isContentEditable) return true;
  const role = target.getAttribute('role');
  if (role === 'textbox' || role === 'searchbox' || role === 'combobox') {
    return true;
  }
  return Boolean(target.closest('[contenteditable="true"]'));
}

function hasOtherVisibleModal(): boolean {
  if (typeof document === 'undefined') return false;
  const modals = document.querySelectorAll('[aria-modal="true"]');
  for (const modal of modals) {
    if (modal.getAttribute('data-dd-shortcuts-modal') === 'true') {
      continue;
    }
    if (modal.closest('[aria-hidden="true"]')) {
      continue;
    }
    return true;
  }
  return false;
}

function normalizeEventKey(event: KeyboardEvent): string {
  const key = event.key;
  if (key.length === 1) {
    return key.toLowerCase();
  }
  return key;
}

function matchesCombo(event: KeyboardEvent, combo: KeyCombo): boolean {
  const key = normalizeEventKey(event);
  if (key !== combo.key.toLowerCase()) return false;

  const hasMod = event.ctrlKey || event.metaKey;
  if (Boolean(combo.mod) !== hasMod) return false;
  if (Boolean(combo.alt) !== event.altKey) return false;

  // For printable punctuation like '?' that inherently requires Shift on most layouts,
  // only enforce shift when explicitly specified.
  if (combo.shift !== undefined && combo.shift !== event.shiftKey) {
    return false;
  }

  // If no modifier is expected and key is a single letter, do not match when Shift is held
  // (prevents unexpected overlap with uppercase typing or shifted symbols).
  if (
    !combo.mod &&
    !combo.alt &&
    combo.shift === undefined &&
    /^[a-z]$/.test(combo.key.toLowerCase()) &&
    event.shiftKey
  ) {
    return false;
  }

  return true;
}

export function KeyboardShortcutsProvider({
  children,
}: {
  readonly children: ReactNode;
}) {
  const [enabled, setEnabledState] = useState<boolean>(
    readShortcutsEnabledPreference,
  );
  const [helpOpen, setHelpOpen] = useState<boolean>(false);
  const [pendingPrefix, setPendingPrefix] = useState<string | null>(null);
  const [shortcuts, setShortcuts] = useState<readonly ShortcutDefinition[]>([]);
  const [lastAnnouncement, setLastAnnouncement] =
    useState<ShortcutAnnouncement | null>(null);

  const registryRef = useRef<Map<string, ShortcutDefinition>>(new Map());
  const enabledRef = useRef<boolean>(enabled);
  const helpOpenRef = useRef<boolean>(helpOpen);
  const pendingPrefixRef = useRef<string | null>(pendingPrefix);
  const chordTimerRef = useRef<number | null>(null);
  const announcementTimerRef = useRef<number | null>(null);
  const announcementIdRef = useRef<number>(0);

  enabledRef.current = enabled;
  helpOpenRef.current = helpOpen;
  pendingPrefixRef.current = pendingPrefix;

  const clearChordTimer = useCallback(() => {
    if (chordTimerRef.current !== null) {
      window.clearTimeout(chordTimerRef.current);
      chordTimerRef.current = null;
    }
  }, []);

  const cancelPendingPrefix = useCallback(() => {
    clearChordTimer();
    pendingPrefixRef.current = null;
    setPendingPrefix(null);
  }, [clearChordTimer]);

  const emitAnnouncement = useCallback((def: ShortcutDefinition) => {
    if (!def.announcement) return;
    if (announcementTimerRef.current !== null) {
      window.clearTimeout(announcementTimerRef.current);
    }
    const nextId = ++announcementIdRef.current;
    setLastAnnouncement({
      id: nextId,
      message: def.announcement,
      keys: def.keys,
      keyJoiner: def.keyJoiner ?? (def.sequence ? 'then' : '+'),
    });
    announcementTimerRef.current = window.setTimeout(() => {
      setLastAnnouncement((current) =>
        current && current.id === nextId ? null : current,
      );
      announcementTimerRef.current = null;
    }, ANNOUNCEMENT_DURATION_MS);
  }, []);

  const setEnabled = useCallback(
    (next: boolean) => {
      setEnabledState(next);
      if (!next) {
        cancelPendingPrefix();
      }
      try {
        window.localStorage.setItem(
          SHORTCUTS_ENABLED_STORAGE_KEY,
          String(next),
        );
      } catch {
        // Ignore storage restrictions
      }
    },
    [cancelPendingPrefix],
  );

  const openHelp = useCallback(() => {
    cancelPendingPrefix();
    setHelpOpen(true);
  }, [cancelPendingPrefix]);

  const closeHelp = useCallback(() => {
    setHelpOpen(false);
  }, []);

  const toggleHelp = useCallback(() => {
    cancelPendingPrefix();
    setHelpOpen((prev) => !prev);
  }, [cancelPendingPrefix]);

  const registerShortcuts = useCallback(
    (definitions: readonly ShortcutDefinition[]) => {
      for (const def of definitions) {
        registryRef.current.set(def.id, def);
      }
      setShortcuts(Array.from(registryRef.current.values()));

      return () => {
        for (const def of definitions) {
          if (registryRef.current.get(def.id) === def) {
            registryRef.current.delete(def.id);
          }
        }
        setShortcuts(Array.from(registryRef.current.values()));
      };
    },
    [],
  );

  const executeShortcut = useCallback(
    (id: string) => {
      const def = registryRef.current.get(id);
      if (!def) return;
      cancelPendingPrefix();
      if (id !== 'reference.help') {
        setHelpOpen(false);
      }
      def.handler();
      emitAnnouncement(def);
    },
    [cancelPendingPrefix, emitAnnouncement],
  );

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      clearChordTimer();
      if (announcementTimerRef.current !== null) {
        window.clearTimeout(announcementTimerRef.current);
      }
    };
  }, [clearChordTimer]);

  // Global keydown manager
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing) return;

      // Always allow Escape to close the shortcuts help modal or cancel a pending chord
      if (event.key === 'Escape') {
        if (helpOpenRef.current) {
          event.preventDefault();
          setHelpOpen(false);
          return;
        }
        if (pendingPrefixRef.current !== null) {
          event.preventDefault();
          cancelPendingPrefix();
          return;
        }
        return;
      }

      // Do not hijack typing inside inputs, textareas, selects, or editable regions
      if (isEditableTarget(event.target)) return;

      // Pause shortcuts while BootSequence, confirmation dialogs, or MobileDrawer are active
      if (hasOtherVisibleModal()) {
        if (pendingPrefixRef.current !== null) {
          cancelPendingPrefix();
        }
        return;
      }

      const key = normalizeEventKey(event);
      const registered = Array.from(registryRef.current.values());

      // When help overlay is open, only allow '?' to toggle it closed
      if (helpOpenRef.current) {
        if (key === '?' && !event.ctrlKey && !event.metaKey && !event.altKey) {
          event.preventDefault();
          setHelpOpen(false);
        }
        return;
      }

      // 1. Handle completion of an active two-key chord (e.g. G -> O)
      const activePrefix = pendingPrefixRef.current;
      if (activePrefix !== null) {
        // Ignore bare modifier presses while waiting for the second chord key
        if (
          event.key === 'Shift' ||
          event.key === 'Control' ||
          event.key === 'Alt' ||
          event.key === 'Meta'
        ) {
          return;
        }

        cancelPendingPrefix();

        if (!event.ctrlKey && !event.metaKey && !event.altKey) {
          const matched = registered.find((def) => {
            if (!enabledRef.current && !def.allowWhenDisabled) return false;
            const matchesPrimary =
              def.sequence !== undefined &&
              def.sequence[0] === activePrefix &&
              def.sequence[1] === key;
            const matchesAlt =
              def.altSequence !== undefined &&
              def.altSequence[0] === activePrefix &&
              def.altSequence[1] === key;
            return matchesPrimary || matchesAlt;
          });

          if (matched) {
            event.preventDefault();
            matched.handler();
            emitAnnouncement(matched);
            return;
          }
        }
      }

      // 2. Check if this key starts a registered two-key chord prefix (e.g. 'g')
      if (
        enabledRef.current &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey &&
        !event.shiftKey &&
        !event.repeat
      ) {
        const isPrefixKey = registered.some(
          (def) =>
            (def.sequence && def.sequence[0] === key) ||
            (def.altSequence && def.altSequence[0] === key),
        );
        if (isPrefixKey) {
          event.preventDefault();
          clearChordTimer();
          pendingPrefixRef.current = key;
          setPendingPrefix(key);
          chordTimerRef.current = window.setTimeout(() => {
            pendingPrefixRef.current = null;
            setPendingPrefix(null);
            chordTimerRef.current = null;
          }, CHORD_TIMEOUT_MS);
          return;
        }
      }

      // 3. Match single-key or modifier combos
      if (event.repeat) return;

      const matchedCombo = registered.find((def) => {
        if (!enabledRef.current && !def.allowWhenDisabled) return false;
        if (def.combo && matchesCombo(event, def.combo)) return true;
        if (def.altCombo && matchesCombo(event, def.altCombo)) return true;
        return false;
      });

      if (matchedCombo) {
        event.preventDefault();
        matchedCombo.handler();
        emitAnnouncement(matchedCombo);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [cancelPendingPrefix, clearChordTimer, emitAnnouncement]);

  const value = useMemo<KeyboardShortcutsContextValue>(
    () => ({
      shortcuts,
      enabled,
      setEnabled,
      helpOpen,
      openHelp,
      closeHelp,
      toggleHelp,
      pendingPrefix,
      cancelPendingPrefix,
      lastAnnouncement,
      registerShortcuts,
      executeShortcut,
    }),
    [
      shortcuts,
      enabled,
      setEnabled,
      helpOpen,
      openHelp,
      closeHelp,
      toggleHelp,
      pendingPrefix,
      cancelPendingPrefix,
      lastAnnouncement,
      registerShortcuts,
      executeShortcut,
    ],
  );

  return (
    <KeyboardShortcutsContext.Provider value={value}>
      {children}
    </KeyboardShortcutsContext.Provider>
  );
}

export function useKeyboardShortcuts(): KeyboardShortcutsContextValue {
  const ctx = useContext(KeyboardShortcutsContext);
  if (!ctx) {
    throw new Error(
      'useKeyboardShortcuts must be used inside a KeyboardShortcutsProvider',
    );
  }
  return ctx;
}

/**
 * Declaratively registers a list of shortcuts while the calling component is mounted.
 */
export function useRegisterShortcuts(
  definitions: readonly ShortcutDefinition[],
): void {
  const { registerShortcuts } = useKeyboardShortcuts();

  useEffect(() => {
    return registerShortcuts(definitions);
  }, [definitions, registerShortcuts]);
}
