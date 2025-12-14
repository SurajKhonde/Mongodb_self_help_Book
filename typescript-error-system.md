
# TypeScript Error Handling Deep Dive  
### Interfaces, Abstract Classes, `extends`, and a Production-Ready Error System

These notes are your reusable guide to:
- How `IError` and `IErrorResponse` work
- What `interface`, `abstract`, `extends`, `super`, `static` really mean
- How the `CustomError` pattern works
- A **production-ready** error module + Express middleware you can use in any project

---

## 1. `IError` vs `IErrorResponse` – Why Two Interfaces?

Original code idea:

```ts
export interface IErrorResponse {
  message: string;
  statusCode: number;
  status: string;
  serializeErrors(): IError;
}

export interface IError {
  message: string;
  statusCode: number;
  status: string;
}
```

At first they look almost the same:

- Both have: `message`, `statusCode`, `status`
- `IErrorResponse` has **one extra method**: `serializeErrors(): IError`

### Simple mental model (kid version)

Think of them as **two roles**:

- **`IError`**  
  = The **plain JSON** that you will send to the frontend in `res.json(...)`, e.g.:

  ```json
  {
    "message": "User not found",
    "statusCode": 404,
    "status": "error"
  }
  ```

- **`IErrorResponse`**  
  = The **“rich error object”** on the server:
  - It has `message`, `statusCode`, `status`
  - It also knows **how to convert itself into** `IError`
    using `serializeErrors()`.

So flow is:

```ts
const err: IErrorResponse = someCustomError;

const body: IError = err.serializeErrors();
// body is the plain JSON shape you send to the client
res.status(err.statusCode).json(body);
```

So:

- `IError` = **output shape of the error JSON**
- `IErrorResponse` = **full object that can produce that JSON**

> Note: You *can* simplify and only use `IError` if you want.  
> The key is: `serializeErrors()` should return a plain object with `message`, `statusCode`, `status`.

---

## 2. What Does `serializeErrors(): IError;` Mean?

In the interface:

```ts
export interface IErrorResponse {
  message: string;
  statusCode: number;
  status: string;
  serializeErrors(): IError;
}
```

The line:

```ts
serializeErrors(): IError;
```

means:

> “Any object that claims to be an `IErrorResponse` **must have** a method named `serializeErrors` that returns something of type `IError`.”

Example of an object that matches `IErrorResponse`:

```ts
const x: IErrorResponse = {
  message: 'hi',
  statusCode: 400,
  status: 'error',
  serializeErrors() {
    return {
      message: this.message,
      statusCode: this.statusCode,
      status: this.status
    };
  }
};
```

Your `CustomError` class provides a `serializeErrors()` method, so instances of that class effectively satisfy this interface.

---

## 3. TypeScript Class Basics – `class`, `extends`, `super`, `abstract`, `static`

### 3.1 `class` – Blueprint for Objects

```ts
class Dog {
  name: string;

  constructor(name: string) {
    this.name = name;
  }

  bark() {
    console.log(`${this.name} says woof`);
  }
}

const d = new Dog('Tommy');
d.bark(); // "Tommy says woof"
```

- `constructor` runs when you do `new Dog(...)`
- `this` refers to the new object being created
- `bark` is an **instance method** (belongs to each object created via `new Dog()`)

---

### 3.2 `extends` – Inheritance

```ts
class Animal {
  name: string;

  constructor(name: string) {
    this.name = name;
  }

  speak() {
    console.log(`${this.name} makes a sound`);
  }
}

class Dog extends Animal {
  constructor(name: string) {
    super(name); // call Animal's constructor
  }

  speak() {
    console.log(`${this.name} barks`);
  }
}

const d = new Dog('Tommy');
d.speak(); // "Tommy barks"
```

- `extends Animal` → `Dog` inherits:
  - `name` property
  - `speak()` method (which it overrides)
- `super(name)` calls the parent (`Animal`) constructor

The instance `d` has the prototype chain:

`d → Dog.prototype → Animal.prototype → Object.prototype`

So:

```ts
d instanceof Dog;    // true
d instanceof Animal; // true
```

---

### 3.3 `super` – Call Parent Constructor/Methods

In a child class, you use `super` to access parent behavior:

```ts
class Parent {
  constructor(msg: string) {
    console.log('Parent says:', msg);
  }
}

class Child extends Parent {
  constructor() {
    super('hello from child'); // calls Parent constructor
  }
}
```

In your `CustomError`:

```ts
constructor(message: string) {
  super(message); // calls built-in Error(message)
}
```

This sets `this.message` in the base `Error` class.

---

### 3.4 `abstract` – Blueprints That Cannot Be Instantiated

```ts
abstract class Shape {
  abstract area(): number; // must be implemented in child
}

class Circle extends Shape {
  constructor(public radius: number) {
    super();
  }

  area(): number {
    return Math.PI * this.radius * this.radius;
  }
}

const c = new Circle(2); // ✅ ok
const s = new Shape();   // ❌ error: cannot create instance of abstract class
```

- `abstract class`:
  - Cannot do `new Shape()`
  - Must be **extended** by child classes
- `abstract area()` says:
  - “Every child must implement `area()`.”

In your case:

```ts
export abstract class CustomError extends Error {
  abstract statusCode: number;
  abstract status: string;

  constructor(message: string) {
    super(message);
  }

  serializeErrors(): IError { ... }
}
```

Means:

- You **cannot** do `new CustomError('x')`
- Any class `extends CustomError` must define:
  - `statusCode`
  - `status`

This is perfect for enforcing that every HTTP error you create has a status code and status string.

---

### 3.5 `static` – Belongs to Class, Not to Instance

Example:

```ts
class MathUtil {
  static add(a: number, b: number) {
    return a + b;
  }

  instanceMethod() {}
}

MathUtil.add(2, 3); // ✅ you call it on the class
const m = new MathUtil();
m.instanceMethod(); // ✅ instance method
// m.add(2, 3);     // ❌ error: add is static
```

- `static` methods live on the **class itself**, not on objects.
- Your error classes don’t use `static` here, but you could add static helpers in the future (e.g. `CustomError.fromJoiError(...)`).

---

## 4. Understanding `CustomError` and Child Classes

### 4.1 Base Class: `CustomError`

A simplified version of your base:

```ts
export abstract class CustomError extends Error {
  abstract statusCode: number;
  abstract status: string;

  constructor(message: string) {
    super(message);
  }

  serializeErrors(): IError {
    return {
      message: this.message,
      status: this.status,
      statusCode: this.statusCode
    };
  }
}
```

What it does:

- `extends Error`  
  → Inherits from built-in `Error`.  
  So `CustomError` has:
  - `message`
  - `stack`
  - `name` (if you set it)

- `abstract statusCode` / `abstract status`  
  → Every subclass **must define**:
  - a numeric `statusCode` (like 400, 404, etc.)
  - a string `status` (like `'error'` or `'fail'`)

- `serializeErrors()`  
  → Converts the full error object into a plain JSON shape you send to client.

### 4.2 Child Error Class Example

```ts
export class NotFoundError extends CustomError {
  statusCode = HTTP_STATUS.NOT_FOUND;
  status = 'error';

  constructor(message: string) {
    super(message);
  }
}
```

Using it:

```ts
const err = new NotFoundError('User not found');

err instanceof NotFoundError; // true
err instanceof CustomError;   // true
err instanceof Error;         // true

err.serializeErrors();
// { message: "User not found", statusCode: 404, status: "error" }
```

In Express global error middleware, you can do:

```ts
if (err instanceof CustomError) {
  const body = err.serializeErrors();
  return res.status(err.statusCode).json(body);
}
```

That’s the magic: `instanceof` checks and one central place handling all errors.

---

## 5. Production-Ready Error System (Copy–Paste Ready)

### Design Goals

- Have a **base HTTP error class** (`CustomError`)
- Have child classes for common HTTP errors:
  - `BadRequestError`, `ValidationError`, `NotFoundError`, etc.
- Ensure:
  - `instanceof` works
  - stack traces are correct
  - you can safely send JSON to the client
- Provide a global Express error handler that understands these errors.

---

### 5.1 `errors.ts` – Reusable Error Module

```ts
// errors.ts
import HTTP_STATUS from 'http-status-codes';

export type ErrorStatus = 'error' | 'fail';

export interface IErrorBody {
  message: string;
  statusCode: number;
  status: ErrorStatus;
  // later: you can add details?: unknown if needed
}

/**
 * Base class for all custom HTTP errors.
 * - Extends built-in Error (so stack/message work)
 * - Forces subclasses to provide statusCode and status
 * - Has serializeErrors() that returns a clean JSON body
 */
export abstract class CustomError extends Error {
  abstract statusCode: number;
  abstract status: ErrorStatus;
  public isOperational = true; // helpful flag for "known" errors

  constructor(message: string) {
    super(message);

    // Fix the prototype chain (important in TS/Node)
    Object.setPrototypeOf(this, new.target.prototype);

    // Give the error a nicer name (class name)
    this.name = new.target.name;

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  serializeErrors(): IErrorBody {
    return {
      message: this.message,
      statusCode: this.statusCode,
      status: this.status
    };
  }
}

// 400 – bad input
export class BadRequestError extends CustomError {
  statusCode = HTTP_STATUS.BAD_REQUEST;
  status: ErrorStatus = 'error';

  constructor(message = 'Bad request') {
    super(message);
  }
}

// 400 – validation error with extra details (e.g. from Joi/Zod)
export class ValidationError extends CustomError {
  statusCode = HTTP_STATUS.BAD_REQUEST;
  status: ErrorStatus = 'fail';
  public details?: unknown;

  constructor(message = 'Invalid request data', details?: unknown) {
    super(message);
    this.details = details;
  }

  serializeErrors(): IErrorBody {
    return {
      ...super.serializeErrors(),
      // you can cast or extend to include details if you want
      // details: this.details
    } as IErrorBody;
  }
}

// 401 – not logged in / invalid auth
export class NotAuthorizedError extends CustomError {
  statusCode = HTTP_STATUS.UNAUTHORIZED;
  status: ErrorStatus = 'error';

  constructor(message = 'Not authorized') {
    super(message);
  }
}

// 403 – logged in but not allowed
export class ForbiddenError extends CustomError {
  statusCode = HTTP_STATUS.FORBIDDEN;
  status: ErrorStatus = 'error';

  constructor(message = 'Forbidden') {
    super(message);
  }
}

// 404 – not found
export class NotFoundError extends CustomError {
  statusCode = HTTP_STATUS.NOT_FOUND;
  status: ErrorStatus = 'error';

  constructor(message = 'Resource not found') {
    super(message);
  }
}

// 409 – conflict (duplicate data, etc.)
export class ConflictError extends CustomError {
  statusCode = HTTP_STATUS.CONFLICT;
  status: ErrorStatus = 'error';

  constructor(message = 'Conflict') {
    super(message);
  }
}

// 413 – file too large
export class FileTooLargeError extends CustomError {
  statusCode = HTTP_STATUS.REQUEST_TOO_LONG;
  status: ErrorStatus = 'error';

  constructor(message = 'File too large') {
    super(message);
  }
}

// 500 – server error
export class ServerError extends CustomError {
  statusCode = HTTP_STATUS.INTERNAL_SERVER_ERROR;
  status: ErrorStatus = 'error';

  constructor(message = 'Internal server error') {
    super(message);
  }
}
```

---

### 5.2 Global Express Error Middleware

```ts
// error-middleware.ts
import { Request, Response, NextFunction } from 'express';
import HTTP_STATUS from 'http-status-codes';
import { CustomError } from './errors';

export function globalErrorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
) {
  // If it is one of our known CustomError subclasses:
  if (err instanceof CustomError) {
    const body = err.serializeErrors();
    return res.status(err.statusCode).json(body);
  }

  // For unknown/unexpected errors, log it and hide internal details
  console.error('UNEXPECTED ERROR:', err);

  return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
    message: 'Internal server error',
    statusCode: HTTP_STATUS.INTERNAL_SERVER_ERROR,
    status: 'error'
  });
}
```

You can enhance this later with Bunyan or another logger:

- 4xx → `log.warn`
- 5xx → `log.error`

---

### 5.3 Example Usage in an Express App

```ts
// app.ts
import express from 'express';
import { BadRequestError, NotFoundError } from './errors';
import { globalErrorHandler } from './error-middleware';

const app = express();
app.use(express.json());

app.get('/user/:id', async (req, res) => {
  const { id } = req.params;

  // Simple validation example
  if (!id.match(/^[0-9a-f]+$/)) {
    throw new BadRequestError('Invalid user id format');
  }

  // Pretend DB call
  const user = null;

  if (!user) {
    throw new NotFoundError('User not found');
  }

  res.json(user);
});

// Must be after all routes & middlewares
app.use(globalErrorHandler);

app.listen(3000, () => {
  console.log('Server running on port 3000');
});
```

Now you have:

- Clean, semantic usage:
  - `throw new NotFoundError('User not found')`
  - `throw new BadRequestError('Invalid payload')`
- Central place that formats all error responses the same way.
- Reusable error module (`errors.ts`) for any Node/TS backend you build.

---

## 6. When to Use Which Error Class

Quick mapping:

- **`BadRequestError`**  
  Request input is wrong / missing / badly formatted (e.g. invalid query/body).

- **`ValidationError`**  
  When a validation library (Joi, Zod, Yup, etc.) says the data is invalid.

- **`NotAuthorizedError` (401)**  
  No token, invalid token, or user is not logged in.

- **`ForbiddenError` (403)**  
  User is logged in but does not have permission (e.g. not admin).

- **`NotFoundError` (404)**  
  Resource doesn’t exist (userId not found, post not found).

- **`ConflictError` (409)**  
  Something already exists (duplicate email, duplicate username).

- **`FileTooLargeError` (413)**  
  Upload exceeds limit (image, video, pdf too big).

- **`ServerError` (500)**  
  Unexpected error on server; something went wrong internally.

---

## 7. Summary Mental Model

- Use **interfaces** to describe shapes of objects and return types (like `IErrorBody`).
- Use **abstract classes** to define common behavior and force child classes to implement key properties (like `statusCode`, `status`).
- Use **`extends` + `super`** so your custom errors behave like real `Error` objects.
- Use **`instanceof CustomError`** in an Express global error middleware to send clean, consistent JSON responses for all known errors.
- Copy `errors.ts` + `error-middleware.ts` into any project → you instantly have a solid, production-ready error system.
