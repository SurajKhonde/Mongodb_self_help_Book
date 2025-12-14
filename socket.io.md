# Real-Time Guide: Polling, WebSocket, and Socket.IO

## 1. Short Polling

### 1.1 What is short polling?

Short polling = **client hits a normal HTTP endpoint every X seconds**:

> “Any new data now?”  
> “Now?”  
> “Now?”

Example:

```ts
// frontend pseudo-code
setInterval(async () => {
  const res = await fetch('/api/updates');
  const data = await res.json();
  // render updates
}, 5000); // every 5 seconds
```

- Server responds **immediately**.
- If nothing new → returns `[]` or `{ hasNew: false }`.

### 1.2 How it works (flow)

1. Client sets a timer (e.g. `setInterval`).
2. Every interval:
   - `GET /api/updates?since=<lastId>`
3. Server:
   - reads `since`
   - returns any data with `id > since` (or "no updates").
4. Client:
   - merges new data
   - updates `lastId`
   - waits for next tick.

### 1.3 Pros

- **Very easy** to implement.
- Uses normal REST endpoints.
- No special infrastructure (no WebSocket, no special server).

### 1.4 Cons

- Many **wasted** requests when nothing changed.
- Latency = **polling interval**:
  - If interval = 5s → users see updates with 0–5s delay.
- At scale:  
  10k clients × request every 3 seconds → ≈ **3,333 requests/sec** (even if 0 updates).

### 1.5 When to use

- Low/medium traffic.
- “Dashboard refresh every 10–30 seconds is fine”.
- Internal tools, admin panels.

### 1.6 Developer action points (short polling)

- Always add a `since` or `lastUpdatedAt` parameter.
- Return **only new data**, not everything.
- Don’t use too small intervals (e.g. <2 seconds) for many users.
- Good starting point when building first prototype.

---

## 2. Long Polling

### 2.1 What is long polling?

Long polling = client asks **once**, and server **keeps the request open** until:

- new data exists, or  
- a timeout is reached.

Idea:

> “Here’s my request, keep it open. Respond as soon as there’s something new.”

### 2.2 How it works (flow)

1. Client sends:

   ```http
   GET /api/updates?since=123
   ```

2. Server logic:
   - If there is data with `id > 123` → respond **immediately**.
   - If not:
     - **store** this response object in memory/queue.
     - **wait** up to e.g. 25–30 seconds.
3. If new data arrives during that time:
   - respond to all waiting clients with new data.
4. If timeout hits and still no data:
   - respond with `[]` (no new data).
5. Client:
   - when response arrives (new data or empty), immediately sends **another long-poll** request.

### 2.3 Pros

- **Near real-time** (server replies as soon as new data is ready).
- Fewer wasted requests vs short polling.
- Still pure HTTP, works behind most proxies/firewalls.

### 2.4 Cons

- Every client keeps **one HTTP request open** most of the time → many concurrent connections.
- Need specific server logic:
  - store list of “waiting clients”
  - handle timeouts
  - clean up on disconnect.

### 2.5 When to use

- You want “real-time-ish”, but:
  - cannot use WebSocket, or
  - environment is HTTP-only.
- Chat, notifications, feed updates for moderate scale.

### 2.6 Developer action points (long polling)

- Store **pending responses** in memory or a structure per topic/room.
- Always set a **timeout** (e.g. 25s) and return an empty response when no data.
- On new data:
  - respond to all matching waiters, then clear them.
- Client must loop: after each response, send new long-poll request.

---

## 3. WebSocket Basics

### 3.1 What is WebSocket?

WebSocket = **protocol for full-duplex communication** over a single TCP connection.

- Starts as HTTP `GET` with `Upgrade: websocket`
- If server accepts → connection turns into a WebSocket
- Both sides can send messages anytime

### 3.2 ws:// vs wss://

- `ws://` → WebSocket over plain TCP (no encryption)
- `wss://` → WebSocket over TLS (encrypted, like HTTPS)

In production: **always use `wss://`**.

### 3.3 Handshake example (simplified)

Browser:

```http
GET /chat HTTP/1.1
Host: example.com
Upgrade: websocket
Connection: Upgrade
Sec-WebSocket-Key: ...
Sec-WebSocket-Version: 13
```

Server:

```http
HTTP/1.1 101 Switching Protocols
Upgrade: websocket
Connection: Upgrade
Sec-WebSocket-Accept: ...
```

After this:

- HTTP “dies”
- Now both sides talk **WebSocket frames** on the same TCP connection.

### 3.4 Pros / cons of raw WebSocket

**Pros:**

- True real-time, very low latency.
- Efficient for many small messages (no HTTP overhead per message).

**Cons:**

- You must handle:
  - reconnection logic
  - heartbeats (ping/pong)
  - message format (JSON convention)
  - auth & permissions
- Harder to scale/load-balance than plain HTTP if you don’t know what you’re doing.

---

## 4. Why Socket.IO?

**Socket.IO** is a **library** built on top of WebSocket + HTTP (via `engine.io`) to make real-time development easier.

### 4.1 What Socket.IO gives you

- Automatic reconnection logic.
- Events: `socket.emit('eventName', data)`, `socket.on('eventName')`.
- Rooms and namespaces.
- Acknowledgements (callbacks).
- Heartbeats and timeouts.
- Fallback to long polling when WebSocket is blocked/not available.
- Easy integration with Node/Express HTTP server.
- Tools to scale (Redis adapter, multiple nodes).

So:

> WebSocket = protocol  
> Socket.IO = real-time framework on top of HTTP/WebSocket.

---

## 5. How Socket.IO Works Internally (High-Level)

### 5.1 Transport and handshake

Server side:

```ts
import express from 'express';
import http from 'http';
import { Server } from 'socket.io';

const app = express();
const httpServer = http.createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: 'http://localhost:3000',
    methods: ['GET', 'POST']
  }
});
```

Client side:

```ts
import { io } from 'socket.io-client';

const socket = io('http://localhost:5000');

socket.on('connect', () => {
  console.log('connected, id:', socket.id);
});
```

Flow:

1. Client sends initial HTTP request:

   ```http
   GET /socket.io/?EIO=4&transport=polling
   ```

2. Server responds with an **Engine.IO handshake** (session id, etc.).
3. Client may start with **long-polling**.
4. Engine.IO tries to **upgrade** to WebSocket:

   ```http
   GET /socket.io/?EIO=4&transport=websocket&sid=<session-id>
   Upgrade: websocket
   ```

5. If upgrade succeeds:
   - Socket.IO now uses **WebSocket** under the hood.
   - If not → it can continue using long polling.

### 5.2 Custom protocol

- Socket.IO uses a **custom framing** on top of WebSocket:
  - Your events (`"chat-message"`) get encoded into specific frames.
- This is why a pure WebSocket client **cannot** talk directly to Socket.IO server (and vice versa) without speaking the same framing.

---

## 6. Why we still use HTTP/HTTPS APIs if Socket.IO is so good?

You **don’t** replace all HTTP APIs with Socket.IO.

Use them **together**:

- HTTP/HTTPS (REST) for:
  - CRUD operations
  - login/register
  - fetching initial data pages
  - non-real-time operations
- Socket.IO for:
  - real-time events (chat messages, typing, presence, notifications)
  - small frequent updates
  - “live” features

Reasons to keep HTTP APIs:

- Caching (CDN, browser cache).
- Simpler for integrators (curl, Postman, 3rd party services).
- Logs/monitoring/metrics easier for HTTP.
- REST operations are naturally request/response.

**Pattern:**

1. Client loads page → uses HTTP to fetch initial state.
2. Client opens Socket.IO connection for **live updates**.
3. Mutations may go either via HTTP or Socket.IO, depending on design.

---

## 7. Core Socket.IO Concepts & APIs

These are the **must-know** pieces for any Socket.IO developer.

### 7.1 `io` (Server instance)

Created from the HTTP server:

```ts
const io = new Server(httpServer, { /* options */ });
```

Used to:

- Listen to connections:

  ```ts
  io.on('connection', (socket) => { ... });
  ```

- Broadcast messages:

  ```ts
  io.emit('global-event', data); // to all connected sockets
  ```

- Send to a room:

  ```ts
  io.to('room-1').emit('room-message', data);
  ```

- Use namespaces:

  ```ts
  const chatNamespace = io.of('/chat');
  chatNamespace.on('connection', (socket) => { ... });
  ```

---

### 7.2 `socket` (per-connection object)

Represents **one client connection**. Not the user, but that specific tunnel.

On server:

```ts
io.on('connection', (socket) => {
  console.log('connected:', socket.id);

  socket.on('disconnect', (reason) => {
    console.log('disconnected:', socket.id, reason);
  });
});
```

Key properties:

- `socket.id` – unique per connection.
- `socket.rooms` – set of rooms the socket has joined.
- `socket.handshake` – contains connection info (IP, query params, auth, etc.).

---

### 7.3 `socket.emit` / `socket.on` (events)

#### Server → Client & Client → Server

**Server side:**

```ts
io.on('connection', (socket) => {
  socket.emit('welcome', { message: 'Hello from server' });

  socket.on('chat-message', (data) => {
    console.log('got chat message:', data);
  });
});
```

**Client side:**

```ts
const socket = io('http://localhost:5000');

socket.on('welcome', (payload) => {
  console.log(payload.message);
});

socket.emit('chat-message', { text: 'Hi everyone!' });
```

- Events are just **string names**: `"welcome"`, `"chat-message"`, `"typing"`, etc.
- Payload can be any JSON-serializable object.

---

### 7.4 Broadcast and rooms

#### Join/leave room

```ts
io.on('connection', (socket) => {
  socket.on('join-room', (roomId: string) => {
    socket.join(roomId);
  });

  socket.on('leave-room', (roomId: string) => {
    socket.leave(roomId);
  });
});
```

#### Send to a room

```ts
io.to('room-1').emit('room-message', { text: 'Hello room-1' });
```

#### Send to everyone **except** this socket (in room)

```ts
socket.to('room-1').emit('room-message', { text: 'Someone joined' });
```

Rooms are **server-side only** – client never “lives” in a room directly, it just asks server to join.

---

### 7.5 Acknowledgements (ACKs)

You can know if the other side received and processed your event.

**Client → Server with callback:**

```ts
socket.emit('save-message', { text: 'Hey' }, (response) => {
  console.log('server ACK:', response.status); // e.g. "ok"
});
```

**Server:**

```ts
io.on('connection', (socket) => {
  socket.on('save-message', (payload, callback) => {
    // save to DB...
    callback({ status: 'ok' });
  });
});
```

Same pattern works server → client too.

---

### 7.6 Disconnect and reconnect

**Server `disconnect` event:**

```ts
io.on('connection', (socket) => {
  socket.on('disconnect', (reason) => {
    console.log('socket disconnected:', socket.id, reason);
  });
});
```

**Client:**

```ts
socket.on('disconnect', (reason) => {
  console.log('disconnected:', reason);
});

socket.on('connect_error', (err) => {
  console.log('connection error:', err.message);
});
```

By default, Socket.IO **automatically tries to reconnect** with exponential backoff.

You can configure:

```ts
const socket = io('http://localhost:5000', {
  reconnection: true,
  reconnectionAttempts: 10,
  reconnectionDelay: 1000
});
```

---

### 7.7 Namespaces

Namespaces = logically separated channels on same server.

```ts
const chatNs = io.of('/chat');
const adminNs = io.of('/admin');

chatNs.on('connection', (socket) => {
  console.log('chat client connected');
});

adminNs.on('connection', (socket) => {
  console.log('admin client connected');
});
```

Client:

```ts
const chatSocket = io('http://localhost:5000/chat');
const adminSocket = io('http://localhost:5000/admin');
```

Use when:

- you want **separate** middlewares, events, auth per type of client.

---

### 7.8 Auth with Socket.IO

Typical pattern:

**Client:**

```ts
const socket = io('http://localhost:5000', {
  auth: {
    token: 'JWT_OR_SESSION_TOKEN'
  }
});
```

**Server middleware:**

```ts
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) {
    return next(new Error('No auth token'));
  }

  // verify token...
  // attach user info:
  (socket as any).userId = '123';

  next();
});
```

If `next(new Error(...))` is called, connection is refused.

---

### 7.9 Scaling Socket.IO

When you have multiple Node instances, clients may connect to any instance.

To broadcast to rooms across instances, use **adapters** (e.g. Redis):

```ts
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient } from 'redis';

const pubClient = createClient({ url: process.env.REDIS_URL });
const subClient = pubClient.duplicate();
await Promise.all([pubClient.connect(), subClient.connect()]);

io.adapter(createAdapter(pubClient, subClient));
```

Now, `io.to('room-1').emit(...)` works across all Node servers.

---

## 8. Developer Must-Know Checklist (Socket.IO)

1. **Always handle `connection` and `disconnect`**:
   - log `socket.id`
   - cleanup any per-socket state

2. **Use rooms for chats / rooms / topics**:
   - `socket.join(roomId)`
   - `io.to(roomId).emit(...)`
   - avoid tracking your own list if not necessary.

3. **Never trust client data**:
   - validate all payloads
   - do permission checks on server

4. **Prefer small JSON messages**:
   - send minimal payload
   - avoid huge objects over socket

5. **Use acknowledgements for important operations**:
   - `socket.emit('save', data, ackFn)`
   - send success/error back

6. **Auth at connection time**:
   - use `io.use` middleware
   - verify token/session before joining rooms

7. **Keep HTTP for CRUD, Socket.IO for events**:
   - fetch big lists via REST
   - push new events via sockets

8. **Monitor and log events**:
   - log errors and disconnect reasons
   - track number of connected sockets

9. **In production**:
   - use `wss://` behind HTTPS
   - configure CORS properly
   - if horizontally scaling, use Redis adapter

---

## 9. Mental Models Summary

- **Short polling** → “Ask every X seconds.”  
- **Long polling** → “Ask once, keep waiting until something happens.”  
- **WebSocket** → “Keep a TCP tunnel open, talk freely both ways.”  
- **Socket.IO** → “Smart tunnel manager: reconnection, rooms, events, fallbacks, scaling.”
