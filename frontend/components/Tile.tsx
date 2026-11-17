import { Tile as T } from '@/lib/types';

// Posiciones de los puntos en una rejilla 3x3 (índices 0..8, por filas).
const LAYOUT: number[][] = [
  [],
  [4],
  [0, 8],
  [0, 4, 8],
  [0, 2, 6, 8],
  [0, 2, 4, 6, 8],
  [0, 2, 3, 5, 6, 8],
  [0, 2, 3, 4, 5, 6, 8],
  [0, 1, 2, 3, 5, 6, 7, 8],
  [0, 1, 2, 3, 4, 5, 6, 7, 8],
];

function Half({ n, y }: { n: number; y: number }) {
  return (
    <>
      {LAYOUT[n].map((i) => (
        <circle key={i} cx={10 + (i % 3) * 10} cy={y + 10 + Math.floor(i / 3) * 10} r={3} className="pip" />
      ))}
    </>
  );
}

export function TileView({
  tile,
  horizontal = false,
  size = 1,
  hidden = false,
  className = '',
  onClick,
  title,
}: {
  tile?: T;
  horizontal?: boolean;
  size?: number;
  hidden?: boolean;
  className?: string;
  onClick?: () => void;
  title?: string;
}) {
  const w = 40 * size;
  const h = 80 * size;
  const Tag = onClick ? 'button' : 'span';
  return (
    <Tag
      className={`tile ${hidden ? 'tile-back' : ''} ${className}`}
      onClick={onClick}
      title={title}
      aria-label={tile && !hidden ? `Ficha ${tile[0]}-${tile[1]}` : 'Ficha'}
      style={{ width: horizontal ? h : w, height: horizontal ? w : h }}
    >
      <svg viewBox="0 0 40 80" width={w} height={h} style={horizontal ? { transform: 'rotate(-90deg)' } : undefined}>
        <rect x="1" y="1" width="38" height="78" rx="6" className="tile-face" />
        {!hidden && tile && (
          <>
            <line x1="5" y1="40" x2="35" y2="40" className="tile-line" />
            <Half n={tile[0]} y={0} />
            <Half n={tile[1]} y={40} />
          </>
        )}
      </svg>
    </Tag>
  );
}
