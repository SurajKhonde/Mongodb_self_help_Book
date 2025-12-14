# Start Redis PubSub

## Start Redis (quick)

```bash
docker run -d --name redis -p 6379:6379 redis:7

```

### Setup project

```bash
mkdir pubsub-demo && cd pubsub-demo
npm init -y
npm i redis
```

### Subscribers (3 services)

`email-subscriber.js`

```ts
import { createClient } from "redis";

const sub = createClient({ url: "redis://localhost:6379" });
sub.on("error", console.error);

await sub.connect();
await sub.subscribe("order.created", (message) => {
  const order = JSON.parse(message);
  console.log(`[EMAIL] Sending confirmation for order ${order.orderId} to user ${order.userId}`);
});

console.log("[EMAIL] Subscribed to order.created");

```

`inventory-subscriber.js`

```ts
import { createClient } from "redis";
const sub = createClient({ url: "redis://localhost:6379" });
sub.on("error", console.error);
await sub.connect();
await sub.subscribe("order.created", (message) => {
  const order = JSON.parse(message);
  console.log(`[INVENTORY] Reducing stock for order ${order.orderId} (amount=${order.amount})`);
});
console.log("[INVENTORY] Subscribed to order.created");
```

`analytics-subscriber.js`

```ts
import { createClient } from "redis";

const sub = createClient({ url: "redis://localhost:6379" });
sub.on("error", console.error);

await sub.connect();
await sub.subscribe("order.created", (message) => {
  const order = JSON.parse(message);
  console.log(`[ANALYTICS] Logging metric: order_created orderId=${order.orderId} amount=${order.amount}`);
});

console.log("[ANALYTICS] Subscribed to order.created");
```

### 3) Publisher (Order Service)

`order-publisher.js`

```ts
import { createClient } from "redis";
const pub = createClient({ url: "redis://localhost:6379" });
pub.on("error", console.error);
await pub.connect();
const msg = JSON.stringify({
  orderId: "o101",
  userId: "u9",
  amount: 499,
});
const receivers = await pub.publish("order.created", msg);
console.log(`[ORDER] Published order.created -> delivered to ${receivers} subscriber(s)`);
await pub.disconnect();

```

#### Run it (open 4 terminals)

```bash
node email-subscriber.js
node inventory-subscriber.js
node analytics-subscriber.js
node analytics-subscriber.js

```

#### Full flow (sequence diagram)

```text
(You start these first)
┌────────────────────┐      ┌──────────────────────┐
│ email-subscriber.js │      │ inventory-subscriber │      analytics-subscriber.js
└─────────┬──────────┘      └─────────┬────────────┘      └──────────┬───────────┘
          │                             │                                │
 1) connect() to Redis                  │                                │
          │                             │                                │
 2) subscribe("order.created", cb)      │                                │
          │                             │                                │
          │                     1) connect()                             │
          │                     2) subscribe("order.created", cb)        │
          │                             │                                │
          │                                                      1) connect()
          │                                                      2) subscribe("order.created", cb)
          │                             │                                │
          │                             │                                │
          │                             │                                │
          │                     (Now run publisher)                      │

┌──────────────────────┐
│  order-publisher.js   │
└──────────┬───────────┘
           │
 3) connect() to Redis
           │
 4) msg = JSON.stringify({orderId, userId, amount})
           │
 5) publish("order.created", msg)  ────────────────────────────────►  Redis Broker
           │                                                       ┌─────────────────┐
           │                                                       │ Redis (Broker)   │
           │                                                       │ channel: order.. │
           │                                                       └───────┬─────────┘
           │                                                               │
           │                                                6) fan-out: send msg to all subscribers
           │                                                               │
           │                       ◄───────────────────────────────────────┼────────────────────────►
           │                                                               │
           │                                                               │
           │        email cb(message)                 inventory cb(message)                 analytics cb(message)
           │        7) JSON.parse                     7) JSON.parse                         7) JSON.parse
           │        8) do work (send email)           8) do work (reduce stock)             8) do work (log metric)
           │        9) console.log                    9) console.log                         9) console.log
           │
 10) publish() returns receiversCount (e.g. 3)
           │
 11) disconnect()

```

##### Key point in Redis Pub/Sub

>[!warning] There is NO ack / retry / storage here.If a subscriber is not running at step 6, it won’t get the message.

##### 2) Subscriber code flow (inside ONE subscriber).

```text

START process
  |
  |-- createClient()
  |
  |-- await connect()
  |
  |-- await subscribe("order.created", onMessageCB)
  |       |
  |       └── Redis now knows: "this client wants order.created"
  |
  └── (Event loop waits...)
          |
          |  (Redis pushes message on that channel)
          v
     onMessageCB(messageString)
          |
          |-- order = JSON.parse(messageString)
          |
          |-- doWork(order)   // send email / reduce stock / analytics log
          |
          └-- return (done)

```

So subscribers basically:

1) Connect
2) register callback for that channel
3) sit idle until Redis delivers a message
4) callback runs when message arrives

##### 3) Publisher code flow (inside order-publisher.js)

```text
START process
  |
  |-- createClient()
  |
  |-- await connect()
  |
  |-- msg = JSON.stringify(order)
  |
  |-- receivers = await publish("order.created", msg)
  |        |
  |        └── Redis immediately broadcasts to currently-subscribed clients
  |
  |-- console.log(receivers)
  |
  └-- await disconnect()
END

```

#### Redis Pub/Sub + Socket.IO adapter
>[!warning] only need Redis Pub/Sub + Socket.IO adapter when you have MORE THAN ONE Socket.IO server instance.

##### Why “simple socket” is not enough.

###### Case A: Single server (no adapter needed)
```text
Client A ----\
              \        Server 1 (Socket.IO)
Client B -----/   (all sockets connected here)
                 io.to(room).emit(...) reaches everyone ✅

```

Because Server 1 knows all connected sockets in its own memory.

###### Case B: Multiple servers (adapter needed)

When you scale:

- You run Server 1 and Server 2
- A load balancer sends different users to different servers
  
```text
            Load Balancer
           /            \
Client A -> Server 1     Server 2 <- Client B
```

Now problem:

- Client A is connected to Server 1
- Client B is connected to Server 2
- If Server 1 does: io.emit("x")

  - it sends only to sockets connected to Server 1
  - Client B won’t get it ❌

Because Server 1 has zero idea about sockets sitting on Server 2.

##### What the Redis adapter does (simple)

It makes all your Socket.IO servers behave like “one big server”.

###### Without adapter

- io.to("room1").emit(...) = local only

###### With adapter

- io.to("room1").emit(...) = local + tell other servers to emit too
  
##### Diagram: how Redis Pub/Sub connects Server 1 and Server 2

###### Example: chat room “room1”

```text
Client A -> Server 1 joins room1
Client B -> Server 2 joins room1

Server 1 memory: room1 has [A]
Server 2 memory: room1 has [B]

```

Now Server 1 emits to room1:

```text
Server 1: io.to("room1").emit("msg","hi")

          |
          | (1) emits locally to its own sockets (A)
          v
Client A gets "hi" ✅

          |
          | (2) adapter also publishes an instruction to Redis:
          |     "send msg=hi to room1"
          v
      Redis Pub/Sub channel
          |
          | (3) Server 2 is subscribed, receives instruction
          v
Server 2: emits locally to its own sockets in room1 (B)
          |
          v
Client B gets "hi" ✅
```

**So Redis is basically the inter-server megaphone.**

---

#### Does Redis “keep record who is who”?

**Not really like a database of users.**

- Each Socket.IO server still tracks its own connected sockets in memory.
- The Redis adapter uses Redis mostly for:
   1  Pub/Sub: broadcast “emit this event” to other nodes
    2 (depending on adapter/version) shared room state / requests so nodes can coordinate things like broadcasting to rooms across nodes.

But Redis typically does not store a permanent “user list” like a real DB. It’s coordination, not long-term storage.

#### Why two Redis clients? (pubClient and subClient)

Redis connections are single-stream. The adapter wants:

- one connection mainly for publishing messages (pubClient)
- one connection mainly for subscribing/listening (subClient)

#### What breaks if you don’t use the adapter in multi-server?

Example scenario:

- 10,000 users
- You run 3 Node servers
- Users spread across them

If Server 1 receives an event “job completed” and you do:

`io.to(userId).emit("done")`
Only users connected to Server 1 get it. Everyone else misses it.
Adapter fixes that.

Yes — horizontal scale means **same code running in 3 separate servers** (like 3 shops with same items).
But Socket.IO’s problem is not “code is different”. The problem is users are connected to different shops, and each shop only knows its **own connected customers.**

#### Why “same code” still needs adapter

A WebSocket connection is stateful:

- When a user connects, they stay attached to one specific server instance.
- That server keeps the socket in RAM (in-memory list).

So:

- Server1 knows only sockets connected to Server1
- Server2 knows only sockets connected to Server2
- Server3 knows only sockets connected to Server3
  
**Same code ≠ shared memory.**

#### When you do need adapter (real-time “push”)

Chat/notifications are like:

- User A sends message
- User B should receive instantly (push)
- User B might be connected to another server
  
  **Without adapter (breaks)**

```text
          Load Balancer
         /            \
User A -> Server1      Server2 <- User B

User A sends msg to Server1
Server1 tries: io.to(B).emit("msg")

But B is not connected to Server1…
Server1 has no socket for B ❌
So B gets nothing ❌

```

#### With Redis adapter (works)

```text
User A -> Server1                Server2 <- User B
            |                       ^
            | publish “emit to B”   |
            v                       |
          Redis Pub/Sub ------------- 

```

**Meaning:** Server1 tells Redis “deliver this event to user B”.
Server2 receives that instruction and emits locally to B ✅

#### “3 shops” analogy

- Each shop has its own customers inside.
- Shop1 announces: “New offer!”
- Only customers inside Shop1 hear it.
- If you want **all shops** to announce it, you need a **central speaker system.**
  Redis adapter = that speaker system.

---

### Below is a small, complete TypeScript demo that shows why the Redis adapter is needed when you run 2 Socket.IO servers

What you’ll see:

- Client A connects to **Server 1**
- Client B connects to **Server 2**

A message emitted to a room from Server 1 reaches **both clients** because the adapter uses **Redis Pub/Sub** to tell Server 2 to emit too.

#### 1) Setup

```bash
docker run -d --name redis -p 6379:6379 redis:7
mkdir sio-redis-adapter-ts && cd sio-redis-adapter-ts
npm init -y
npm i express socket.io redis @socket.io/redis-adapter socket.io-client
npm i -D typescript ts-node-dev @types/express

```

`tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "rootDir": "src",
    "outDir": "dist",
    "strict": true,
    "esModuleInterop": true
  }
}

```

`package.json` scripts

```json
{
  "scripts": {
    "dev": "ts-node-dev --respawn --transpile-only src/server.ts",
    "client": "ts-node-dev --respawn --transpile-only src/client.ts"
  }
}

```

### 2) Server (Socket.IO + Redis adapter)

`src/server.ts`

```ts
import express from "express";
import http from "http";
import { Server } from "socket.io";
import { createClient } from "redis";
import { createAdapter } from "@socket.io/redis-adapter";

const PORT = Number(process.env.PORT ?? 5001);
const NODE_ID = process.env.NODE_ID ?? `node-${PORT}`;
const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";

async function main() {
  const app = express();
  app.use(express.json());

  const httpServer = http.createServer(app);

  const io = new Server(httpServer, {
    cors: { origin: "*" }
  });

  // Redis adapter setup (this is the important part)
  const pubClient = createClient({ url: REDIS_URL });
  const subClient = pubClient.duplicate();

  await Promise.all([pubClient.connect(), subClient.connect()]);
  io.adapter(createAdapter(pubClient, subClient));

  io.on("connection", (socket) => {
    console.log(`[${NODE_ID}] socket connected: ${socket.id}`);

    // Join a room (e.g., chat room or userId room)
    socket.on("joinRoom", (roomId: string) => {
      socket.join(roomId);
      console.log(`[${NODE_ID}] ${socket.id} joined room: ${roomId}`);
      socket.emit("joined", { roomId, node: NODE_ID });
    });

    // A client sends a message -> server broadcasts to the room
    socket.on("sendToRoom", (payload: { roomId: string; text: string }) => {
      const { roomId, text } = payload;

      // IMPORTANT: with adapter, this reaches sockets in this room
      // across ALL server instances (not just this process).
      io.to(roomId).emit("roomMessage", {
        fromNode: NODE_ID,
        fromSocketId: socket.id,
        roomId,
        text,
        at: new Date().toISOString()
      });

      console.log(`[${NODE_ID}] broadcast to room ${roomId}: ${text}`);
    });
  });

  // HTTP endpoint to emit too (optional)
  app.post("/emit/:roomId", (req, res) => {
    const roomId = req.params.roomId;
    const text = String(req.body?.text ?? "hello from HTTP");

    io.to(roomId).emit("roomMessage", {
      fromNode: NODE_ID,
      fromSocketId: "HTTP",
      roomId,
      text,
      at: new Date().toISOString()
    });

    res.json({ ok: true, node: NODE_ID, roomId, text });
  });

  httpServer.listen(PORT, () => {
    console.log(`[${NODE_ID}] listening on http://localhost:${PORT}`);
    console.log(`[${NODE_ID}] Redis: ${REDIS_URL}`);
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

```

### 3) Client (connect + join room + send)

`src/client.ts`

```ts
import { io } from "socket.io-client";

const SERVER_URL = process.env.SERVER_URL ?? "http://localhost:5001";
const NAME = process.env.NAME ?? "client";
const ROOM = process.env.ROOM ?? "room1";

const socket = io(SERVER_URL, {
  transports: ["websocket"] // keep it simple
});

socket.on("connect", () => {
  console.log(`[${NAME}] connected to ${SERVER_URL} as ${socket.id}`);

  socket.emit("joinRoom", ROOM);

  // Send after join (small delay for demo)
  setTimeout(() => {
    socket.emit("sendToRoom", { roomId: ROOM, text: `hi from ${NAME}` });
  }, 500);
});

socket.on("joined", (data) => {
  console.log(`[${NAME}] joined room=${data.roomId} (handled by ${data.node})`);
});

socket.on("roomMessage", (msg) => {
  console.log(`[${NAME}] got message:`, msg);
});

socket.on("disconnect", () => {
  console.log(`[${NAME}] disconnected`);
});

```

#### 4) Run the demo (2 servers + 2 clients)

```bash
// Terminal A: Server 1
PORT=5001 NODE_ID=server-1 npm run dev
//Terminal B: Server 2
PORT=5002 NODE_ID=server-2 npm run dev
//Terminal C: Client A connects to Server 1
SERVER_URL=http://localhost:5001 NAME=A ROOM=room1 npm run client
//Terminal D: Client B connects to Server 2
SERVER_URL=http://localhost:5002 NAME=B ROOM=room1 npm run client

```
