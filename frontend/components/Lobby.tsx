'use client';
import { useState } from 'react';
import { Rules } from '@/lib/types';

export function Lobby({
  onCreate,
  onJoin,
}: {
  onCreate: (rules: Partial<Rules>) => void;
  onJoin: (tableId: string, seat?: number) => void;
}) {
  const [code, setCode] = useState('');
  const [seat, setSeat] = useState('');
  const [target, setTarget] = useState(100);
  const [countAllHands, setCountAll] = useState(true);
  const [tranqueByIndividual, setTranqueInd] = useState(true);

  return (
    <div className="lobby">
      <section className="card">
        <h2>Crear mesa</h2>
        <label>
          Partida a
          <input type="number" min={10} max={500} value={target} onChange={(e) => setTarget(Number(e.target.value))} />
          puntos
        </label>
        <label className="check">
          <input type="checkbox" checked={countAllHands} onChange={(e) => setCountAll(e.target.checked)} />
          Contar las fichas de las cuatro manos (si no, solo las de los rivales)
        </label>
        <label className="check">
          <input type="checkbox" checked={tranqueByIndividual} onChange={(e) => setTranqueInd(e.target.checked)} />
          En el tranque gana el jugador con menos puntos (si no, la pareja)
        </label>
        <button className="primary" onClick={() => onCreate({ target, countAllHands, tranqueByIndividual })}>
          Crear mesa
        </button>
      </section>
      <section className="card">
        <h2>Unirse a una mesa</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (code.trim()) onJoin(code.trim().toUpperCase(), seat === '' ? undefined : Number(seat));
          }}
        >
          <input placeholder="Código (ej. K7M2Q)" value={code} onChange={(e) => setCode(e.target.value)} maxLength={8} />
          <select value={seat} onChange={(e) => setSeat(e.target.value)}>
            <option value="">Cualquier asiento</option>
            <option value="0">Asiento 1 (pareja A)</option>
            <option value="1">Asiento 2 (pareja B)</option>
            <option value="2">Asiento 3 (pareja A)</option>
            <option value="3">Asiento 4 (pareja B)</option>
          </select>
          <button className="primary" type="submit">
            Unirse
          </button>
        </form>
      </section>
    </div>
  );
}
