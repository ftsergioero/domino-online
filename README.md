# domino-online

Juego de dominó online multijugador en tiempo real (monorepo: frontend + backend).

- **backend/** — NestJS + Socket.IO. Lleva las salas y el motor del juego (todas las reglas se validan en el servidor).
- **frontend/** — Next.js (React). La mesa de juego en el navegador.

## Cómo jugar en local

Requisitos: Node.js 20 o superior.

```bash
# 1. Servidor (puerto 3001)
cd backend
npm install
npm run build
npm start
```

```bash
# 2. Cliente web (puerto 3000), en otra terminal
cd frontend
npm install
npm run build
npm start
```

Abre http://localhost:3000, escribe tu nombre y pulsa **Crear sala**. Comparte el código de 4 letras
(o el enlace de invitación) con tus amigos; cuando estén todos, el anfitrión pulsa **Empezar partida**.

Para desarrollo con recarga automática usa `npm run start:dev` (backend) y `npm run dev` (frontend).

### Jugar con amigos en otra red

El cliente se conecta por defecto al mismo host en el puerto 3001. Si despliegas el backend en otra
dirección, indícala al compilar el frontend:

```bash
NEXT_PUBLIC_SERVER_URL=https://mi-servidor.example.com npm run build
```

Variables del backend: `PORT` (por defecto 3001) y `CORS_ORIGIN` (orígenes permitidos separados por comas;
por defecto se permite cualquiera).

## Reglas

- Doble seis (28 fichas), 7 fichas por jugador, de 2 a 4 jugadores.
- **4 jugadores:** por parejas (puestos 1 y 3 contra 2 y 4; el anfitrión puede reordenar los puestos). Sin pozo.
- **2 o 3 jugadores:** individual. Las fichas sobrantes forman el pozo: si no puedes jugar, robas.
- La primera mano la abre quien tenga el doble más alto, jugándolo. Las siguientes, el ganador de la mano anterior.
- Si no puedes jugar ni robar, pasas automáticamente.
- **Dominó:** quien se queda sin fichas gana la mano; su bando suma los puntos de todas las fichas que quedan.
- **Tranque:** si nadie puede jugar, gana el bando con menos puntos en la mano (empate: nadie suma).
- Gana la partida quien llegue antes a la puntuación elegida (50, 100, 150 o 200).

Si se cierra el navegador o se pierde la conexión, al volver a abrir la página se reconecta solo a la partida.

## Tests

```bash
cd backend
npm test
```

Incluyen pruebas de las reglas, una simulación de cientos de partidas completas y una partida de 4 jugadores
a través de Socket.IO.

## Backend con Docker

```bash
docker compose up -d --build
```

Levanta el backend en el puerto 3001 (comprueba con `curl http://localhost:3001/health`).

## Frontend en Vercel + backend en tu PC

1. Despliega `frontend/` en Vercel (Root Directory: `frontend`).
2. En tu PC, levanta el backend (`docker compose up -d --build`).
3. Exponlo a internet con HTTPS mediante un túnel, por ejemplo Cloudflare Tunnel:
   `cloudflared tunnel --url http://localhost:3001` (te dará una dirección `https://xxxx.trycloudflare.com`).
4. Abre la web de Vercel, despliega «Servidor del juego», pega esa dirección y pulsa «Guardar y conectar».
5. Crea la sala y comparte el enlace de invitación: ya incluye la dirección del servidor.

La página de Vercel es HTTPS, así que el backend también debe serlo (por eso el túnel); una dirección
`http://` con tu IP no funcionará desde la web publicada.
