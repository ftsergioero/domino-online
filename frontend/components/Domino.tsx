const PIPS_V: Record<number, number[]> = {
  0: [],
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};
const PIPS_H: Record<number, number[]> = { ...PIPS_V, 6: [0, 1, 2, 6, 7, 8] };

function Half({ value, horizontal }: { value: number; horizontal: boolean }) {
  const on = (horizontal ? PIPS_H : PIPS_V)[value];
  return (
    <span className="half">
      {Array.from({ length: 9 }, (_, i) => (
        <span key={i} className={on.includes(i) ? 'pip' : 'pip off'} />
      ))}
    </span>
  );
}

export function Domino({
  a,
  b,
  horizontal = false,
  size = 'md',
  state,
  onClick,
  title,
}: {
  a: number;
  b: number;
  horizontal?: boolean;
  size?: 'sm' | 'md' | 'lg';
  state?: 'playable' | 'selected' | 'dim' | 'new';
  onClick?: () => void;
  title?: string;
}) {
  const cls = ['domino', horizontal ? 'h' : 'v', size, state ?? ''].join(' ');
  const content = (
    <>
      <Half value={a} horizontal={horizontal} />
      <span className="divider" />
      <Half value={b} horizontal={horizontal} />
    </>
  );
  if (onClick) {
    return (
      <button type="button" className={cls} onClick={onClick} title={title ?? `${a}|${b}`} aria-label={`Ficha ${a} ${b}`}>
        {content}
      </button>
    );
  }
  return (
    <span className={cls} title={title ?? `${a}|${b}`} aria-label={`Ficha ${a} ${b}`}>
      {content}
    </span>
  );
}

export function TileBack({ size = 'sm', horizontal = false }: { size?: 'sm' | 'md'; horizontal?: boolean }) {
  return <span className={`domino back ${horizontal ? 'h' : 'v'} ${size}`} aria-hidden />;
}
