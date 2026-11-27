'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import type { PlacedTile, Side } from '@/lib/types';
import { Domino } from './Domino';

/** Separación entre fichas, en píxeles. */
const GAP = 2;
/** Margen a cada lado del tablero. */
const PAD = 4;

interface Placed {
  /** Posición de la ficha en `board`. */
  index: number;
  x: number;
  y: number;
  a: number;
  b: number;
  horizontal: boolean;
}

/**
 * Coloca la cadena «en serpiente» desde el centro: la ficha de salida en medio, el brazo
 * derecho avanza hacia la derecha y baja al llegar al borde; el izquierdo avanza hacia la
 * izquierda y sube. En cada borde la ficha de la esquina se pone vertical y la cadena
 * sigue en sentido contrario, sin cortarse.
 *
 * `s` es el tamaño de media ficha (una ficha horizontal mide 2s × s).
 */
export function layoutSnake(board: PlacedTile[], origin: number, width: number, s: number) {
  const items: Placed[] = [];
  if (board.length === 0) return { items, height: 0 };
  const minX = PAD;
  const maxX = width - PAD;

  // Ficha de salida, centrada. Los dobles van cruzados (verticales).
  const c = board[origin];
  const cDouble = c.a === c.b;
  const cw = cDouble ? s : 2 * s;
  const ch = cDouble ? 2 * s : s;
  const cx = width / 2 - cw / 2;
  items.push({ index: origin, x: cx, y: -ch / 2, a: c.a, b: c.b, horizontal: !cDouble });

  /**
   * Un brazo de la cadena. `tiles` va del centro hacia fuera, con el número que toca
   * a la ficha anterior (`inner`) y el que queda libre (`outer`).
   * dir: 1 = hacia la derecha, -1 = hacia la izquierda. vdir: 1 = gira hacia abajo, -1 = hacia arriba.
   */
  const arm = (tiles: { index: number; inner: number; outer: number }[], dir0: 1 | -1, vdir: 1 | -1) => {
    let dir = dir0;
    // Borde de la cadena por el que se sigue colocando.
    let x = dir > 0 ? cx + cw + GAP : cx - GAP;
    // Línea central de la fila actual y hasta dónde llega la última ficha hacia el lado del giro.
    let yc = 0;
    let far = vdir > 0 ? ch / 2 : -ch / 2;

    for (const t of tiles) {
      const dbl = t.inner === t.outer;
      const w = dbl ? s : 2 * s;
      const h = dbl ? 2 * s : s;
      const fits = dir > 0 ? x + w <= maxX : x - w >= minX;

      if (fits) {
        const left = dir > 0 ? x : x - w;
        // En horizontal, la mitad que toca a la anterior va del lado de donde venimos.
        const [a, b] = dir > 0 ? [t.inner, t.outer] : [t.outer, t.inner];
        items.push({ index: t.index, x: left, y: yc - h / 2, a, b, horizontal: !dbl });
        x = dir > 0 ? x + w + GAP : x - w - GAP;
        far = vdir > 0 ? Math.max(far, yc + h / 2) : Math.min(far, yc - h / 2);
        continue;
      }

      // Esquina: la ficha se pone vertical justo debajo (o encima) del final de la fila.
      const edge = dir > 0 ? x - GAP : x + GAP; // borde exterior de la última ficha colocada
      const left = dir > 0 ? edge - s : edge;
      const top = vdir > 0 ? far + GAP : far - GAP - 2 * s;
      const [a, b] = vdir > 0 ? [t.inner, t.outer] : [t.outer, t.inner];
      items.push({ index: t.index, x: left, y: top, a, b, horizontal: false });

      // La nueva fila sale de la mitad libre de la esquina, en sentido contrario.
      yc = vdir > 0 ? top + 1.5 * s : top + 0.5 * s;
      far = vdir > 0 ? top + 2 * s : top;
      dir = dir > 0 ? -1 : 1;
      x = dir > 0 ? left + s + GAP : left - GAP;
    }
  };

  // Brazo derecho: board[origin+1..], cada ficha toca por su lado `a`.
  arm(
    board.slice(origin + 1).map((p, k) => ({ index: origin + 1 + k, inner: p.a, outer: p.b })),
    1,
    1,
  );
  // Brazo izquierdo: board[origin-1..0], cada ficha toca por su lado `b`.
  arm(
    board
      .slice(0, origin)
      .map((p, k) => ({ index: k, inner: p.b, outer: p.a }))
      .reverse(),
    -1,
    -1,
  );

  // Normaliza para que todo quede en coordenadas positivas.
  const minY = Math.min(...items.map((i) => i.y));
  const maxY = Math.max(...items.map((i) => i.y + (i.horizontal ? s : 2 * s)));
  for (const i of items) i.y = i.y - minY + PAD;
  return { items, height: maxY - minY + PAD * 2 };
}

export function Board({
  board,
  origin,
  newestIndex,
  targets,
}: {
  board: PlacedTile[];
  origin: number;
  newestIndex: number;
  /** Si hay una ficha elegida que cabe en ambos lados: tocar un extremo la juega ahí. */
  targets?: Partial<Record<Side, () => void>>;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  // Tamaño de media ficha según el ancho disponible (unas 6 fichas por fila en un móvil).
  const s = Math.max(16, Math.min(34, Math.floor((width - 2 * PAD) / 12.5)));
  // Con un servidor antiguo que no manda la ficha de salida, se toma la primera.
  const safeOrigin = Number.isInteger(origin) ? Math.min(Math.max(origin, 0), board.length - 1) : 0;
  const { items, height } = width ? layoutSnake(board, safeOrigin, width, s) : { items: [], height: 0 };
  const last = board.length - 1;

  return (
    <div className="snake" ref={ref} style={{ height, ['--snake-s' as string]: `${s}px` }}>
      {items.map((it) => {
        const side: Side | null = it.index === 0 ? 'left' : it.index === last ? 'right' : null;
        const onTarget = side && last > 0 ? targets?.[side] : undefined;
        const tile = (
          <Domino
            a={it.a}
            b={it.b}
            horizontal={it.horizontal}
            size="sm"
            state={it.index === newestIndex ? 'new' : undefined}
          />
        );
        return onTarget ? (
          <button
            key={it.index}
            type="button"
            className="snake-tile target"
            style={{ left: it.x, top: it.y }}
            onClick={onTarget}
            aria-label={`Jugar en este extremo (${side === 'left' ? it.a : it.b})`}
          >
            {tile}
          </button>
        ) : (
          <span key={it.index} className="snake-tile" style={{ left: it.x, top: it.y }}>
            {tile}
          </span>
        );
      })}
    </div>
  );
}
