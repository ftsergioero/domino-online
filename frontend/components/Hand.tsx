'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Tile } from '@/lib/types';
import { Domino } from './Domino';

const keyOf = (t: Tile) => `${Math.min(t[0], t[1])}-${Math.max(t[0], t[1])}`;
/** Píxeles que hay que mover el dedo/ratón para que cuente como arrastre y no como toque. */
const DRAG_THRESHOLD = 8;
/** Tiempo manteniendo pulsada una ficha (sin moverla) para girarla. */
const LONG_PRESS_MS = 450;

/**
 * Orden de las fichas de la mano, elegido por el jugador. Solo vive en este navegador:
 * el servidor sigue identificando cada ficha por su posición en la mano real.
 */
function useHandOrder(hand: Tile[], storageKey: string) {
  const [order, setOrder] = useState<string[]>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) ?? '[]');
      return Array.isArray(saved) ? saved : [];
    } catch {
      return [];
    }
  });

  // Quita las fichas jugadas y añade al final las nuevas (las robadas o una mano nueva).
  const keys = hand.map(keyOf);
  const present = new Set(keys);
  const effective = [...order.filter((k) => present.has(k)), ...keys.filter((k) => !order.includes(k))];

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(effective));
    } catch {
      /* nada */
    }
  }, [storageKey, effective.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  return [effective, setOrder] as const;
}

/**
 * Ordena la mano como una cadena de grupos por número: todas las fichas de un número
 * juntas y, al final del grupo, la ficha que enlaza con el siguiente número
 * (p. ej. todos los 7, terminando en 7|4, y después todos los 4…).
 * Devuelve el orden y qué fichas hay que girar para que el número del grupo quede arriba.
 */
export function chainSort(tiles: Tile[]): { order: string[]; flipped: string[] } {
  const left = new Map(tiles.map((t) => [keyOf(t), t]));
  const has = (t: Tile, n: number) => t[0] === n || t[1] === n;
  const count = (n: number) => [...left.values()].filter((t) => has(t, n)).length;
  const other = (t: Tile, n: number) => (t[0] === n ? t[1] : t[0]);
  const order: string[] = [];
  const flipped: string[] = [];
  let current: number | null = null;

  while (left.size > 0) {
    // Si no hay con qué enlazar, empieza por el número del que más fichas quedan (a igualdad, el más alto).
    if (current === null || count(current) === 0) {
      let best = -1;
      for (let n = 9; n >= 0; n--) if (best < 0 || count(n) > count(best)) best = n;
      current = best;
    }
    const n: number = current;
    const group: Tile[] = [...left.values()].filter((t) => has(t, n));
    group.forEach((t) => left.delete(keyOf(t)));

    // Ficha de enlace: la que lleva al número con más fichas restantes.
    let link: Tile | null = null;
    let linkCount = 0;
    for (const t of group) {
      if (t[0] === t[1]) continue;
      const c = count(other(t, n));
      if (c > linkCount || (c === linkCount && link && other(t, n) > other(link, n))) {
        link = t;
        linkCount = c;
      }
    }
    if (linkCount === 0) link = null;

    const sorted = group
      .filter((t) => t !== link)
      .sort((a, b) => {
        const da = a[0] === a[1] ? 1 : 0;
        const db = b[0] === b[1] ? 1 : 0;
        return db - da || other(b, n) - other(a, n); // el doble primero, luego de mayor a menor
      });
    if (link) sorted.push(link);
    for (const t of sorted) {
      order.push(keyOf(t));
      if (t[0] !== n) flipped.push(keyOf(t)); // que el número del grupo quede arriba
    }
    current = link ? other(link, n) : null;
  }
  return { order, flipped };
}

/**
 * Animación «FLIP»: cuando cambia el orden, cada ficha se desliza desde donde estaba
 * hasta su nuevo sitio en lugar de saltar.
 */
function useFlip(order: string[], skip: string | null) {
  const els = useRef(new Map<string, HTMLElement>());
  const last = useRef(new Map<string, DOMRect>());

  useLayoutEffect(() => {
    const next = new Map<string, DOMRect>();
    els.current.forEach((el, k) => {
      const now = el.getBoundingClientRect();
      next.set(k, now);
      const before = last.current.get(k);
      if (!before || k === skip) return;
      const dx = before.left - now.left;
      const dy = before.top - now.top;
      if (!dx && !dy) return;
      el.style.transition = 'none';
      el.style.transform = `translate(${dx}px, ${dy}px)`;
      requestAnimationFrame(() => {
        el.style.transition = 'transform 160ms ease';
        el.style.transform = '';
      });
    });
    last.current = next;
  }, [order.join(','), skip]); // eslint-disable-line react-hooks/exhaustive-deps

  return (k: string) => (el: HTMLElement | null) => {
    if (el) els.current.set(k, el);
    else els.current.delete(k);
  };
}

interface Drag {
  key: string;
  /** Posición actual del puntero. */
  x: number;
  y: number;
  /** Dónde se agarró la ficha, respecto a su esquina. */
  offX: number;
  offY: number;
}

/** Zona de la mesa (el tapete verde) que hay bajo el puntero, si la hay. */
function tableUnder(x: number, y: number): HTMLElement | null {
  for (const el of document.elementsFromPoint(x, y)) {
    const t = (el as HTMLElement).closest<HTMLElement>('[data-drop-table]');
    if (t) return t;
  }
  return null;
}

/** Ilumina la mesa mientras se arrastra encima: verde si se puede soltar ahí, rojo si no. */
function markTable(table: HTMLElement | null, ok: boolean | null) {
  document.querySelectorAll('[data-drop-table]').forEach((el) => {
    el.classList.toggle('drop-ok', el === table && ok === true);
    el.classList.toggle('drop-no', el === table && ok === false);
  });
}

export function Hand({
  hand,
  storageKey,
  stateOf,
  onTap,
  canDrop,
  onDropOnTable,
}: {
  hand: Tile[];
  /** Clave para recordar el orden (por sala, jugador y mano). */
  storageKey: string;
  stateOf: (index: number) => 'playable' | 'selected' | 'dim' | undefined;
  onTap: (index: number) => void;
  /** Si soltar esa ficha en la mesa sería una jugada válida ahora mismo. */
  canDrop?: (index: number) => boolean;
  /** Se soltó la ficha sobre la mesa en (x, y). */
  onDropOnTable?: (index: number, x: number, y: number) => void;
}) {
  const [order, setOrder] = useHandOrder(hand, storageKey);
  const [flipped, setFlipped] = useState<string[]>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(`${storageKey}-giro`) ?? '[]');
      return Array.isArray(saved) ? saved : [];
    } catch {
      return [];
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(`${storageKey}-giro`, JSON.stringify(flipped));
    } catch {
      /* nada */
    }
  }, [storageKey, flipped]);
  /** Cómo se dibuja la ficha (girada o no); solo cambia el aspecto, no la ficha. */
  const shown = (k: string, t: Tile): Tile => (flipped.includes(k) ? [t[1], t[0]] : t);
  const [drag, setDrag] = useState<Drag | null>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const orderRef = useRef(order);
  orderRef.current = order;
  const flipRef = useFlip(order, drag?.key ?? null);

  const indexOf = new Map(hand.map((t, i) => [keyOf(t), i]));
  const tileOf = new Map(hand.map((t) => [keyOf(t), t]));
  const indexRef = useRef(indexOf);
  indexRef.current = indexOf;
  const onTapRef = useRef(onTap);
  onTapRef.current = onTap;

  const sortBy = (fn: (t: Tile) => number) => {
    setOrder([...order].sort((a, b) => fn(tileOf.get(a)!) - fn(tileOf.get(b)!)));
    setFlipped([]);
  };
  const groupByNumber = () => {
    const r = chainSort(hand);
    setOrder(r.order);
    setFlipped(r.flipped);
  };

  /** Coloca la ficha arrastrada junto a la ficha que hay bajo el puntero. */
  const reorderAt = (key: string, x: number, y: number) => {
    const row = rowRef.current;
    if (!row) return;
    const slots = [...row.querySelectorAll<HTMLElement>('[data-tile]')].filter((el) => el.dataset.tile !== key);
    if (slots.length === 0) return;
    // La ficha más cercana al puntero (sirve aunque el dedo esté entre dos fichas o fuera de la fila).
    let best = slots[0];
    let bestDist = Infinity;
    for (const el of slots) {
      const r = el.getBoundingClientRect();
      const d = Math.hypot(x - (r.left + r.width / 2), y - (r.top + r.height / 2));
      if (d < bestDist) {
        bestDist = d;
        best = el;
      }
    }
    const r = best.getBoundingClientRect();
    const after = x > r.left + r.width / 2;
    const current = orderRef.current;
    const next = current.filter((k) => k !== key);
    next.splice(next.indexOf(best.dataset.tile!) + (after ? 1 : 0), 0, key);
    if (next.join(',') !== current.join(',')) setOrder(next);
  };

  /** Gira una ficha (solo cambia cómo se ve: el 9 arriba y el 3 abajo, o al revés). */
  const [spinning, setSpinning] = useState<string | null>(null);
  const flip = (key: string) => {
    setFlipped((f) => (f.includes(key) ? f.filter((k) => k !== key) : [...f, key]));
    setSpinning(key);
    setTimeout(() => setSpinning((s) => (s === key ? null : s)), 260);
  };
  const stateRef = useRef(stateOf);
  stateRef.current = stateOf;
  const canDropRef = useRef(canDrop);
  canDropRef.current = canDrop;
  const onDropRef = useRef(onDropOnTable);
  onDropRef.current = onDropOnTable;

  const onPointerDown = (e: React.PointerEvent<HTMLElement>, key: string) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const startX = e.clientX;
    const startY = e.clientY;
    const rect = e.currentTarget.getBoundingClientRect();
    let dragging = false;
    let longPressed = false;
    // Mantener pulsada la ficha sin moverla la gira.
    const timer = setTimeout(() => {
      longPressed = true;
      navigator.vibrate?.(30);
      flip(key);
    }, LONG_PRESS_MS);

    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== e.pointerId) return;
      if (!dragging) {
        if (longPressed || Math.hypot(ev.clientX - startX, ev.clientY - startY) < DRAG_THRESHOLD) return;
        dragging = true;
        clearTimeout(timer);
      }
      ev.preventDefault();
      setDrag({ key, x: ev.clientX, y: ev.clientY, offX: startX - rect.left, offY: startY - rect.top });
      // Sobre la mesa: se marca si soltarla ahí la juega. Junto a la mano: se reordena.
      const i = indexRef.current.get(key);
      const table = tableUnder(ev.clientX, ev.clientY);
      markTable(table, table && i !== undefined ? (canDropRef.current?.(i) ?? false) : null);
      if (!table) reorderAt(key, ev.clientX, ev.clientY);
    };
    const end = (ev: PointerEvent) => {
      if (ev.pointerId !== e.pointerId) return;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
      clearTimeout(timer);
      setDrag(null);
      markTable(null, null);
      // Soltada encima de la mesa: se intenta jugar.
      if (dragging && ev.type === 'pointerup' && tableUnder(ev.clientX, ev.clientY)) {
        const i = indexRef.current.get(key);
        if (i !== undefined) onDropRef.current?.(i, ev.clientX, ev.clientY);
        return;
      }
      if (!dragging && !longPressed && ev.type === 'pointerup') {
        const i = indexRef.current.get(key);
        if (i === undefined) return;
        // Un toque juega la ficha si se puede jugar; si no, la gira.
        const st = stateRef.current(i);
        if (st === 'playable' || st === 'selected') onTapRef.current(i);
        else flip(key);
      }
    };
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
  };

  const dragTile = drag && tileOf.get(drag.key) ? shown(drag.key, tileOf.get(drag.key)!) : undefined;

  return (
    <div className="hand-wrap">
      <div className="hand" ref={rowRef}>
        {order.map((k) => {
          const t = shown(k, tileOf.get(k)!);
          const i = indexOf.get(k)!;
          return (
            <div
              key={k}
              ref={flipRef(k)}
              data-tile={k}
              className={`hand-slot ${drag?.key === k ? 'placeholder' : ''} ${spinning === k ? 'spin' : ''}`}
              role="button"
              tabIndex={0}
              aria-label={`Ficha ${t[0]} ${t[1]}`}
              onPointerDown={(e) => onPointerDown(e, k)}
              onContextMenu={(e) => e.preventDefault()}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onTap(i);
                } else if (e.key === 'r' || e.key === 'R') {
                  flip(k);
                }
              }}
            >
              <Domino a={t[0]} b={t[1]} size="lg" state={stateOf(i)} />
            </div>
          );
        })}
      </div>

      {/* La ficha levantada sigue al dedo o al cursor. */}
      {drag && dragTile && (
        <div className="hand-ghost" style={{ left: drag.x - drag.offX, top: drag.y - drag.offY }} aria-hidden>
          <Domino a={dragTile[0]} b={dragTile[1]} size="lg" />
        </div>
      )}

      {hand.length > 1 && (
        <div className="hand-tools">
          <span className="muted small">Arrastra para mover · mantén pulsada para girar ·</span>
          <button className="btn tiny" onClick={groupByNumber} title="Agrupa por número formando una cadena">
            Agrupar por número
          </button>
          <button className="btn tiny" onClick={() => sortBy((t) => t[0] + t[1])}>
            Por puntos
          </button>
        </div>
      )}
    </div>
  );
}
