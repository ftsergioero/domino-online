# domino-online

Dominó cubano (doble nueve, en parejas) online y en tiempo real. Monorepo con npm workspaces:

| Carpeta | Qué es |
|---|---|
| `backend/` | NestJS + Socket.IO. Servidor autoritativo: reparte, valida cada jugada y lleva el marcador. |
| `backend/src/domain/` | Motor, conteo y detección de eventos de reacción. TypeScript puro, sin dependencias. |
| `frontend/` | Next.js. Cliente web mínimo para jugar una partida de 4. |

## Arrancar con Docker (todo)

```bash
docker compose up -d --build        # redis + mysql + server + web
```

Web en http://localhost:3000, servidor en http://localhost:4000. La URL del servidor que usa
el navegador se fija al construir la imagen web (`NEXT_PUBLIC_SERVER_URL` en
`docker-compose.yml`); para jugar desde otros equipos cámbiala a la IP de la máquina y
reconstruye (y añade ese origen a `CORS_ORIGIN` del servicio `server`).

## Arrancar en local (desarrollo)

```bash
npm install
docker compose up -d redis mysql    # opcional
cp backend/.env.example backend/.env
npm run dev:server                  # http://localhost:4000
npm run dev:web                     # http://localhost:3000
```

Sin `REDIS_URL` las mesas se guardan en memoria y sin `DB_HOST` los perfiles también, así que
se puede jugar sin Docker (quita esas variables del `.env`).

**Probar una partida de 4:** abre 4 pestañas en `http://localhost:3000`. Cada pestaña es un
jugador distinto (el id va en `sessionStorage`). En una crea la mesa, en las otras únete con el
código. Al recargar una pestaña el jugador vuelve a su asiento.

## Tests

```bash
npm test -w backend                 # unitarios del dominio (Jest)
npm run test:e2e -w backend         # 4 bots juegan una partida completa contra el gateway
E2E_USE_INFRA=1 npm run test:e2e -w backend   # lo mismo usando Redis y MySQL del .env
```

## Reglas implementadas

- 55 fichas (0-0 a 9-9), 10 por jugador, 15 fuera. Parejas 0-2 contra 1-3.
- Solo se juega por los dos extremos. No se puede pasar teniendo jugada.
- **Pegarse:** un jugador se queda sin fichas y su pareja gana la mano. Si la última ficha
  entraba por los dos extremos se marca **capicúa** (solo para reacciones; no puntúa extra).
- **Tranque:** los 4 pasan seguidos.
- Partida a 100 (configurable al crear la mesa). Reglas de conteo configurables por mesa:
  - `countAllHands`: contar las fichas de las cuatro manos (por defecto) o solo las de los rivales.
  - `tranqueByIndividual`: en el tranque gana el jugador con menos puntos (por defecto) o la pareja.
    Si empatan jugadores de parejas distintas (o las dos parejas) nadie anota.
- El primer salidor es aleatorio y después rota cada mano.

> Pendiente de confirmar (como decía el documento): qué variante de conteo y de tranque usáis
> por defecto. Se cambia en `DEFAULT_RULES` (`backend/src/domain/scoring.ts`).

## Protocolo WebSocket

Conexión con `auth: { playerId, name }`. Todas las peticiones responden con ack
`{ ok: true, ... }` o `{ ok: false, error }`.

**Del cliente:** `table:create { rules?, seat? }`, `table:join { tableId, seat? }`,
`table:resume` (reconectar), `table:leave`, `table:rematch`, `game:play { tile, side }`,
`game:pass`, `chat:phrase { text, gesture? }`.

**Del servidor:** `game:state` (vista personal: tu mano y solo el número de fichas de los demás),
`game:turn { seat }`, `game:pegado { seat, capicua }`, `game:tranque { totals }`,
`hand:score { winnerTeam, points, score, totals, hands }`, `match:end { winnerTeam, score }`,
`reaction { seat, name, event, gesture, phrase }`, `chat:phrase { seat, name, text, gesture }`.

## Persistencia

- **Redis:** `domino:table:{id}` (estado completo de la mesa, caduca a las 24 h) y
  `domino:player:{playerId}:table` (para reconectar).
- **MySQL (Sequelize):** `users`, `profiles` (avatar + reacciones en JSON) y `match_history`.
  Las tablas se crean solas al arrancar (`synchronize`).

REST: `GET/PUT /profiles/:playerId`, `GET /profiles/:playerId/history`, `GET /reactions/events`.

## Reacciones

El perfil guarda una lista `{ event, gesture, phrase }`. Eventos: `pegarse`, `pasar`, `tranque`
(lo dispara quien puso la ficha que trancó), `capicua`, `ganar_mano`, `perder_mano`,
`ganar_partida`, `perder_partida`. El servidor detecta el evento (`detectEvents` en el dominio),
busca la reacción del jugador y emite `reaction` a toda la mesa.

El avatar del cliente es por ahora un marcador en CSS (`frontend/components/Avatar.tsx`) con los
mismos inputs que tendrá la máquina de estados de Rive (`mood`, `gesture`, piezas del avatar).

## Limitaciones conocidas

- Sin autenticación: el `playerId` que genera el cliente hace de credencial.
- Una sola instancia del servidor: el bloqueo por mesa y el temporizador entre manos están en
  memoria. Para escalar: adaptador de Socket.IO para Redis y lock distribuido.
- Sin límite de tiempo por turno.
