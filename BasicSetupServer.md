# Random Server Things We Must Know

---

## HTTP

Express can already “start a server” with `app.listen()`. So why this?

```ts
import http from 'http';
...
const httpServer: http.Server = new http.Server(app);
httpServer.listen(SERVER_PORT, () => { ... });
```

### 1. Express does not replace `http` – it sits on top

- Node’s `http` module = the **actual server** (it talks to TCP, ports, sockets).
- Express = just a **request handler function** `(req, res) => { ... }`.

```ts
const app = express();
app.get('/ping', ...);
app.listen(5000);
```

`app.listen` is just sugar for:

```ts
const http = require('http');
const server = http.createServer(app);
server.listen(5000);
```

So:

- `app` = “what to do when a request comes”
- `http.Server` = “the thing that listens on port 5000”

### 2. Why use `http.Server` explicitly?

Because they also need the **raw server** for Socket.IO:

```ts
const httpServer: http.Server = new http.Server(app);
const socketIO: Server = await this.createSocketIO(httpServer);
this.startHttpServer(httpServer);
this.socketIOConnections(socketIO);
```

Look inside `createSocketIO`:

```ts
const io: Server = new Server(httpServer, { cors: { ... } });
```

Socket.IO needs the HTTP server instance so it can:

- hook into the same port
- listen for WebSocket / upgrade events on that server

If they did `app.listen(...)`:

- They would not have direct access to the `httpServer` object (unless they grab the return).
- The code would look more confusing with Socket.IO.

So they do:

1. Create `httpServer` from Express app  
2. Pass `httpServer` into `new Server(httpServer, ...)` (Socket.IO)  
3. Start listening: `httpServer.listen(...)`

This way:

- Express **HTTP routes**
- Socket.IO **WebSocket connections**

→ both share the **same underlying Node HTTP server** and the same port.

---

## CORS

### 1. Big picture: 2 requests, not 1

When **CORS preflight** happens, the browser does:

1. **First request** → `OPTIONS` = “May I do this?”
2. **Second request** → `GET` / `POST` / `PUT` / etc. = “Do the real work”

Both are normal HTTP requests over the same internet as everything else.  
Preflight is just an **extra first HTTP request** sent by the browser.

### 2. When does the browser do preflight?

Browser looks at your JS call:

```ts
fetch('http://localhost:8000/api/user', {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ...' },
  body: JSON.stringify({ name: 'Suraj' })
});
```

It checks:

- Is this **cross-origin?** (frontend origin ≠ backend origin)
- Is this a **non-simple** request?  
  (methods like `PUT`, `DELETE`, or custom headers, or JSON content-type)

If **yes**, then browser does:

> “Hmm, this might be dangerous. Let me ask the server first if it’s okay.”

That “ask” = **preflight**.

### 3. What does preflight request look like?

Browser sends an HTTP `OPTIONS` request to the same URL:

```http
OPTIONS /api/user HTTP/1.1
Host: localhost:8000
Origin: http://localhost:3000
Access-Control-Request-Method: PUT
Access-Control-Request-Headers: content-type,authorization
```

Meaning:

- `Origin` → “I’m a page from `http://localhost:3000`”
- `Access-Control-Request-Method` → “I want to use `PUT`”
- `Access-Control-Request-Headers` → “I want to send these headers”

This is **preflight**.  
Just a normal HTTP request with method `OPTIONS`.

### 4. How does the server respond?

If your server is okay with that, it replies:

```http
HTTP/1.1 204 No Content
Access-Control-Allow-Origin: http://localhost:3000
Access-Control-Allow-Methods: GET,POST,PUT,DELETE,OPTIONS
Access-Control-Allow-Headers: content-type,authorization
Access-Control-Allow-Credentials: true
```

The browser then checks:

- Does `Access-Control-Allow-Origin` match my `Origin`?
- Does `Access-Control-Allow-Methods` include `PUT`?
- Does `Access-Control-Allow-Headers` include `content-type`, `authorization`?

If **yes** → OK, send the **real** request.  
If **no** → block, and your JS gets a CORS error.

So full flow:

1. JS → `fetch(...)`  
2. Browser → `OPTIONS` (preflight)  
3. Server → “Yes, allowed”  
4. Browser → sends real `PUT`  
5. Server → sends data  
6. Browser → gives data to JS  

### 5. How Express handles it (example)

```ts
app.use(
  cors({
    origin: config.CLIENT_URL,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
  })
);
```

### 6. Not every request has preflight

Browser sends **two requests (OPTIONS + real)** only when **all** these are true:

1. It’s a **cross-origin** request  
   (frontend origin ≠ backend origin, e.g. `3000` → `8000`)
2. It’s **not** a “simple” request

If the request is **simple**, browser sends **only the real request** (no preflight).

### 7. What is a “simple” request? (no preflight)

A request is “simple” if:

- Method is `GET`, `HEAD`, or `POST`
- **AND** headers are only “simple” ones (like):
  - `Accept`
  - `Accept-Language`
  - `Content-Type` (but only these values):
    - `text/plain`
    - `multipart/form-data`
    - `application/x-www-form-urlencoded`
- No weird/custom headers (like `X-My-Header`)
- No strange stuff in request

Example (no preflight):

```ts
fetch('http://localhost:8000/api/user', {
  method: 'GET'
});
```

or:

```ts
fetch('http://localhost:8000/api/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: 'username=suraj&password=123'
});
```

👉 Browser sends **only 1 request** here.

### 8. When do we get preflight (OPTIONS + real)?

If **any** of these happens:

- Method is `PUT`, `PATCH`, `DELETE`, etc.
- OR you send headers like:
  - `Authorization`
  - `X-Requested-With`
  - custom headers (`X-Whatever`)
  - `Content-Type: application/json`
- OR other “non-simple” stuff

Then browser does:

1. `OPTIONS` (preflight): “Can I do this?”  
2. If server says OK → real `PUT`/`POST`/whatever.

Example (will cause preflight):

```ts
fetch('http://localhost:8000/api/user', {
  method: 'PUT',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer abc'
  },
  body: JSON.stringify({ name: 'Suraj' })
});
```

### 9. Preflight is also cached

Browser can cache preflight result when server sends:

```http
Access-Control-Max-Age: 600
```

That means:

- “This preflight is valid for 600 seconds (10 minutes)”
- During that time, **same kind of request** can skip `OPTIONS` and go straight to the real request.

So even for complex requests, it’s **not always** two requests every time.

---

## Helmet

Helmet sounds like “magic security”, but it’s actually very simple:

> **Helmet = a set of security HTTP headers for Express.**  
> It doesn’t fix your code logic, it fixes **browser-side security defaults**.

### 1. What problem is Helmet solving?

Browsers have some **dangerous default behaviors**:

- They allow your page to be put inside iframes (clickjacking).
- They try to guess content type (MIME sniffing).
- They happily run inline `<script>` (XSS easier).
- They send referrer info to other sites (privacy issue).
- They allow your site to talk to any domain via `<script>`, `<img>`, etc.

Helmet sends special headers to tell the browser:

> “Don’t do the risky default stuff. Follow these stricter rules.”

So Helmet = **better defaults for security.**

### 2. What does Helmet actually do?

When you call:

```ts
app.use(helmet());
```

Helmet sets multiple headers, such as:

#### a) `X-Frame-Options` / `frame-ancestors` (via CSP)

**Problem it solves:**  
Someone can embed your site in a hidden `<iframe>` on another site and trick users into clicking buttons (**clickjacking**).

**Helmet effect:**  
Adds headers so the browser **refuses to show your site inside iframes** on other domains.

#### b) `X-Content-Type-Options: nosniff`

**Problem:**  
Browsers try to **guess** file types (MIME sniffing).  
If a response looks like JavaScript, the browser might run it even if you didn’t intend that → possible XSS.

**Helmet:**  
Tells the browser:

> “Don’t guess. Only trust the `Content-Type` header.”

This reduces some XSS / content-type confusion issues.

#### c) `Content-Security-Policy` (CSP)

_Not fully enabled by default, but Helmet helps configure it._

**Problem:**  
XSS – attacker injects `<script>` or loads scripts from `evil.com`.

**Helmet CSP config:**  
You can restrict where resources can be loaded from, for example:

- which domains scripts can come from (`'self'`, CDNs)
- where images/styles/fonts can come from

Example: only allow scripts from your own domain:

```ts
import helmet from 'helmet';

app.use(
  helmet.contentSecurityPolicy({
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"]
    }
  })
);
```

### 3. Why do we need Helmet?

You **can** manually set these headers:

```ts
app.use((req, res, next) => {
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  // ... more headers
  next();
});
```

But that is:

- easy to forget
- easy to misconfigure
- annoying to maintain

Helmet gives you:

- one line: `app.use(helmet())`
- sane default security for most Express apps
- ability to tune each header as needed

Helmet doesn’t replace **auth**, **input validation**, or **database security**.  
It **hardens browser-side behavior** by sending smart HTTP headers.

### 4. How to use Helmet in production (basic setup)

```ts
import helmet from 'helmet';

app.use(helmet());
```

Later you can customize CSP, referrer policy, HSTS, etc., as needed.

---

## HPP

### 1. What is HPP?

`hpp` = **HTTP Parameter Pollution** (and the npm package name for the middleware).

**HTTP Parameter Pollution** = when the same query/body parameter appears **multiple times** in one request.

Example:

```http
GET /user?role=user&role=admin
```

Here `role` appears twice.

In Express, `req.query.role` could be:

- `'admin'`
- or `['user', 'admin']`

…depending on parser/config.

Attackers can use this to **bypass your logic** if you’re not careful.

Usage:

```ts
import hpp from 'hpp';

app.use(hpp());
```

`hpp()` cleans up polluted parameters so each key has only **one value** (by default, the last value).

---

## Compression

### 1. Why use `compression`?

**Short answer:**  
To send **less data over the network**, so responses are **faster** and **cheaper**.

Example:

- Your API sends 100 KB of JSON
- With gzip/brotli compression, it might become **20 KB**
- Over slow 4G / mobile, this makes a big difference

It’s especially useful for:

- JSON
- HTML
- CSS
- JS

Not very useful for:

- images (jpg/png/webp already compressed)
- videos
- big binary files

So `compression()` middleware compresses responses **automatically** when it makes sense.

### 2. How does it actually work?

This is pure HTTP, not your custom logic.

#### Step 1: Browser says what it supports

Browser sends header:

```http
Accept-Encoding: gzip, deflate, br
```

Meaning:

> “Hey server, I understand these compressions: `gzip`, `deflate`, `br` (brotli).  
> You can send me compressed data if you want.”

#### Step 2: Server (Express + `compression`) decides

If:

- type is compressible (JSON/HTML/JS/CSS, etc.)
- size is big enough

`compression()` middleware:

- compresses the body (e.g. using gzip)
- adds header:

```http
Content-Encoding: gzip
```

So the response looks like:

```http
HTTP/1.1 200 OK
Content-Encoding: gzip
Content-Type: application/json

<compressed-binary-data>
```

#### Step 3: Browser automatically decompresses

When browser sees:

```http
Content-Encoding: gzip
```

it automatically:

- decompresses the body
- gives your JS the **normal string/JSON**, not compressed bytes

So in frontend:

```ts
const res = await fetch('/api/data');
const json = await res.json(); // normal JSON, no manual decompress
```

You do **nothing** special. No extra code.

Same for `axios`, `fetch`, etc. → they work as usual.

### 3. Do I need to decompress in frontend?

**No.**

Frontend (browser) flow is:

1. Sends `Accept-Encoding` header  
2. Gets compressed response  
3. Decompresses internally  

Your JS sees a **normal** response.

You only care about compression if:

- you are writing a low-level HTTP client by hand (sockets, raw TCP), or
- some special microcontroller / no HTTP stack

For browser + axios/fetch → done for you.

### 4. When to use `compression` in production

Good practice:

- Use `compression()` in Express **OR**
- Let your reverse proxy (Nginx, API Gateway, CDN) handle compression

> Don’t double compress. If Nginx/CDN already compresses, you can disable Express `compression()` to save CPU.

Basic production usage:

```ts
import compression from 'compression';

app.use(compression());
// then routes...
```
# Cookie Sessions vs JWT – How They Work

## 1. What Is `cookie-session`?

Example from your code:

```ts
app.use(
  cookieSession({
    name: 'session',
    keys: [config.SECRET_KEY_ONE!, config.SECRET_KEY_TWO!],
    maxAge: 24 * 7 * 3600000,
    secure: config.NODE_ENV !== 'development'
  })
);
```

`cookie-session` is an Express middleware that:

- Creates a `req.session` object for each request.
- Stores the **session data directly inside a cookie** on the client.
- **Signs** that cookie with `keys` so the client **cannot modify data** without detection.
- Does **NOT** use Redis / DB for sessions – it’s a **stateless session via cookie**.

So:

- **Traditional session:**  
  `sessionId` in cookie → session data stored **on server** (Redis/DB/memory).
- **`cookie-session`:**  
  session **data itself** in cookie → verified by server via signature.

---

## 2. How a Cookie Session Is Created and Sent (Step by Step)

### Step 0: Middleware setup

```ts
app.use(
  cookieSession({
    name: 'session',
    keys: [config.SECRET_KEY_ONE!, config.SECRET_KEY_TWO!],
    maxAge: 24 * 7 * 3600000, // 7 days
    secure: config.NODE_ENV !== 'development'
  })
);
```

This middleware:

- On each request:
  - reads cookie named `"session"`
  - verifies signature with your `keys`
  - if valid → parses data into `req.session`
  - if not present/invalid → `req.session = {}` (empty)

---

### Step 1: Login sets the session

Example route:

```ts
app.post('/login', async (req, res) => {
  const { email, password } = req.body;

  // 1. validate user
  const user = await User.findOne({ email });
  if (!user || !(await user.comparePassword(password))) {
    return res.status(400).json({ message: 'Invalid credentials' });
  }

  // 2. put data in session
  req.session = {
    userId: user.id,
    email: user.email
  };

  // 3. send response
  res.json({ message: 'Logged in' });
});
```

What happens:

- You set `req.session = { userId, email }`.
- `cookie-session` middleware (on response) serializes this object into a cookie:
  - signs it with your `keys`
  - sets:

    ```http
    Set-Cookie: session=...; HttpOnly; Secure; Max-Age=...
    ```

- Browser receives this cookie and stores it.

---

### Step 2: Browser sends the cookie automatically

On the next request:

```ts
fetch('https://api.example.com/me', {
  credentials: 'include'   // ⭐ if cross-origin
});
```

Browser automatically attaches:

```http
Cookie: session=eyJ1c2VySWQiOiIxMjMiLCJlbWFpbCI6InN1cmFqQGV4YW1wbGUuY29tIn0....signature
```

On server:

- `cookie-session` reads this cookie
- verifies signature
- parses data into `req.session` again:

```ts
app.get('/me', (req, res) => {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ message: 'Not logged in' });
  }

  res.json({
    userId: req.session.userId,
    email: req.session.email
  });
});
```

You don’t parse cookies manually; middleware does it.

---

## 3. How JWT Works (Basics)

A **JWT (JSON Web Token)** is a string with 3 parts:

```text
header.payload.signature
```

Example shape:

```text
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiIxMjMiLCJlbWFpbCI6InN1cmFqQGV4YW1wbGUuY29tIn0.I9x...
```

- **Header** → algorithm & token type (usually HS256, “JWT”)
- **Payload** → JSON data (claims), like `{ userId, email, exp }`
- **Signature** → HMAC or RSA signature to prove token is valid and not modified

### 3.1 Creating a JWT (backend)

Using `jsonwebtoken`:

```ts
import jwt from 'jsonwebtoken';

const payload = {
  userId: user.id,
  email: user.email
};

const token = jwt.sign(payload, process.env.JWT_SECRET as string, {
  expiresIn: '7d'
});
```

- `jwt.sign(payload, secret, options)`:
  - encodes payload as base64url
  - signs it with `secret`
  - sets `exp` (expiry) if `expiresIn` given
- `token` is just a string.

### 3.2 Verifying a JWT (backend)

```ts
import jwt from 'jsonwebtoken';

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization; // "Bearer <token>"

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Not authorized' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as {
      userId: string;
      email: string;
    };

    (req as any).user = decoded; // attach user to request
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
}
```

- `jwt.verify(token, secret)`:
  - checks signature
  - checks expiry
  - returns decoded payload if valid

---

## 4. Using JWT in Practice

### 4.1 Flow: Token in Response, Saved in `localStorage`

**Backend login:**

```ts
app.post('/login', async (req, res) => {
  const { email, password } = req.body;

  // validate user...
  const user = await User.findOne({ email });
  if (!user || !(await user.comparePassword(password))) {
    return res.status(400).json({ message: 'Invalid credentials' });
  }

  const token = jwt.sign(
    { userId: user.id, email: user.email },
    process.env.JWT_SECRET as string,
    { expiresIn: '7d' }
  );

  res.json({ token }); // send token in JSON
});
```

**Frontend (insecure but common pattern):**

```ts
// login
const res = await fetch('http://localhost:8000/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password })
});

const { token } = await res.json();

// store
localStorage.setItem('token', token);

// later: call protected API
const meRes = await fetch('http://localhost:8000/me', {
  headers: {
    Authorization: `Bearer ${token}`
  }
});
```

**Problems:**

- `localStorage` is readable by any JS on the page → **XSS can steal token**.
- You must manually attach token on each request.

---

### 4.2 JWT in Cookie (more secure style)

Instead of sending token in JSON and storing it in `localStorage`, you can:

**Backend:**

```ts
app.post('/login', async (req, res) => {
  const { email, password } = req.body;

  // validate user...
  const user = await User.findOne({ email });
  if (!user || !(await user.comparePassword(password))) {
    return res.status(400).json({ message: 'Invalid credentials' });
  }

  const token = jwt.sign(
    { userId: user.id, email: user.email },
    process.env.JWT_SECRET as string,
    { expiresIn: '7d' }
  );

  res
    .cookie('auth', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000
    })
    .json({ message: 'Logged in' });
});
```

**Middleware to read JWT from cookie:**

```ts
import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';

function jwtCookieAuth(req: Request, res: Response, next: NextFunction) {
  const token = (req.cookies as any)?.auth;
  if (!token) {
    return res.status(401).json({ message: 'Not authorized' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as {
      userId: string;
      email: string;
    };
    (req as any).user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
}
```

**Frontend:**

```ts
// login
await fetch('http://localhost:8000/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  credentials: 'include', // ⭐ important for cookies cross-origin
  body: JSON.stringify({ email, password })
});

// get current user
const res = await fetch('http://localhost:8000/me', {
  credentials: 'include' // ⭐ send auth cookie
});
const data = await res.json();
```

Flow is now very similar to `cookie-session`, but the cookie value is a **JWT string** instead of a JSON object.

---

## 5. Cookie-Session vs JWT – Comparison

### With `cookie-session`:

- Session data is **stored as JSON in cookie**, signed by server.
- No server-side store (stateless).
- Flow:
  - server sets `Set-Cookie` with serialized `req.session`
  - browser sends `Cookie` automatically
- Protection:
  - use `HttpOnly`, `Secure`, `SameSite` for better security.
- Easy to use in Express: `req.session` feels very natural.

**Pros:**

- Very simple to use.
- No session store (like Redis) needed.
- Automatic cookie handling by browser.
- Great for small/medium web apps.

**Cons:**

- Cookie size limit (~4KB). Can’t store big objects.
- Session data is **visible** (base64 JSON) – signed, not encrypted:
  - User can see it, but can’t modify without breaking signature.
- Revoking sessions (logout everywhere) is trickier in purely stateless setups.

---

### With JWT (Authorization header style):

- Token is a **self-contained proof**, usually stored on client (often localStorage).
- Backend just verifies signature on each request, no session store needed.
- Good for:
  - mobile apps
  - multiple backends/microservices
  - non-browser clients

**Pros:**

- Very easy to share across services (any service with `JWT_SECRET` can verify).
- Stateless: no DB/Redis needed for session lookup.
- Works well beyond browsers (mobile, IoT, other servers).

**Cons:**

- If stored in `localStorage`, vulnerable to XSS.
- Manual header management in frontend.
- Revocation (log out before `exp`) requires extra logic (blacklists, token version, etc.).

---

## 6. Minimal Example: Express + `cookie-session` + Frontend

### Backend (Node/Express)

```ts
import express from 'express';
import cookieSession from 'cookie-session';

const app = express();
app.use(express.json());

app.use(
  cookieSession({
    name: 'session',
    keys: ['SECRET_KEY_ONE', 'SECRET_KEY_TWO'],
    maxAge: 24 * 60 * 60 * 1000, // 1 day
    httpOnly: true,
    secure: false, // set true in production with https
    sameSite: 'lax'
  })
);

app.post('/login', (req, res) => {
  const { email, password } = req.body;

  // fake user check
  if (email !== 'test@example.com' || password !== '123456') {
    return res.status(400).json({ message: 'Invalid credentials' });
  }

  // create session
  req.session = { userId: '123', email };

  res.json({ message: 'Logged in' });
});

app.get('/me', (req, res) => {
  if (!req.session?.userId) {
    return res.status(401).json({ message: 'Not logged in' });
  }

  res.json({
    userId: req.session.userId,
    email: req.session.email
  });
});

app.post('/logout', (req, res) => {
  req.session = null; // clears cookie
  res.json({ message: 'Logged out' });
});

app.listen(8000, () => console.log('Server on 8000'));
```

### Frontend (cross-origin example)

```ts
// login
await fetch('http://localhost:8000/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  credentials: 'include',            // ⭐ important
  body: JSON.stringify({ email, password })
});

// get current user
const res = await fetch('http://localhost:8000/me', {
  credentials: 'include'             // ⭐ send cookie
});
const data = await res.json();
```

**Key point:**

- Frontend doesn’t manually manage session token.
- Browser handles cookie; server handles `req.session`.

---

## 7. One-Line Mental Models

- **`cookie-session`:**  
  “Store small, signed session data directly in a cookie; server reads it into `req.session`; browser auto-sends it; you don’t need a separate token system.”

- **JWT (header or cookie):**  
  “Self-contained token with user claims and expiry; server verifies signature on each request; good for stateless auth across many different clients/services.”

## WebSocket && Long-short Polling
[Socket.IO notes](./Socket.io.md)
## Application Types like(Buffer && Streaming)
[Application types](./applictionDatatype.md)
