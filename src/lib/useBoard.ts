import { useEffect, useRef, useState } from 'react';
import type { GameView } from '../types';
import { read, write } from './storage';
import { rpc } from './supabase';

export function useBoard(roomId: string | null, storageKey: string, view: GameView | null, onError: () => void, onSaved: () => Promise<void>) {
  const [closed, setClosed] = useState<string[]>(() => roomId ? [] : read(`${storageKey}:closed`, []));
  const [saving, setSaving] = useState(false);
  const current = useRef(closed);
  const version = useRef(-1);
  const epoch = useRef(storageKey);
  const pending = useRef(false);
  const queue = useRef(Promise.resolve());
  const active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  useEffect(() => {
    if (epoch.current === storageKey) return;
    epoch.current = storageKey; version.current = -1;
    current.current = []; setClosed([]);
  }, [storageKey]);
  const update = (next: string[]) => {
    if (pending.current) return;
    const previous = current.current;
    current.current = next; setClosed(next);
    if (!roomId) return;
    pending.current = true; setSaving(true);
    const key = storageKey;
    queue.current = (async () => {
      try {
        const saved = await rpc<{closed: string[]; version: number; automatic_guess?: {correct: boolean}}>('set_board', {p_room: roomId, p_closed: next});
        if (active.current && epoch.current === key) { version.current = saved.version; current.current = saved.closed; setClosed(saved.closed); }
      } catch {
        if (active.current && epoch.current === key) { current.current = previous; setClosed(previous); onError(); }
        version.current = -1;
      } finally {
        pending.current = false;
        await onSaved();
        if (active.current) setSaving(false);
      }
    })();
  };
  useEffect(() => { if (!roomId) write(`${storageKey}:closed`, closed); }, [closed, storageKey, roomId]);
  useEffect(() => {
    if (!roomId || !view || pending.current || view.own_board_version <= version.current) return;
    version.current = view.own_board_version;
    current.current = view.own_closed || []; setClosed(current.current);
  }, [roomId, view, storageKey]);
  return { closed, saving, changeClosed: (change: string[] | ((previous: string[]) => string[])) => update(typeof change === 'function' ? change(current.current) : change), flushBoard: () => queue.current };
}
