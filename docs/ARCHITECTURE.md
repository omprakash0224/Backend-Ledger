# Architecture Overview

## Table of Contents

- [System Summary](#system-summary)
- [High-Level Architecture](#high-level-architecture)
- [Layer Breakdown](#layer-breakdown)
  - [Client Layer](#1-client-layer)
  - [API Gateway & Routing](#2-api-gateway--routing)
  - [Middleware Layer](#3-middleware-layer)
  - [Controller Layer (Business Logic)](#4-controller-layer-business-logic)
  - [Service Layer (Async & External)](#5-service-layer-async--external)
  - [Data Layer (MongoDB)](#6-data-layer-mongodb)
  - [External Services](#7-external-services)
- [Key Flows](#key-flows)
  - [Authentication Flow](#authentication-flow)
  - [Account Management Flow](#account-management-flow)
  - [Transaction Flow](#transaction-flow)
  - [Fraud Detection Flow](#fraud-detection-flow)
- [Design Decisions](#design-decisions)
- [Security Considerations](#security-considerations)

---

## System Summary

This system is a **Node.js/Express financial backend** that handles user authentication, account management, and monetary transactions. It enforces security through JWT-based authentication and a real-time fraud detection engine, persists data in MongoDB, and delivers transactional emails via Gmail SMTP using Nodemailer with OAuth2.

---

## High-Level Architecture

```
Client App
    │
    ├── POST /api/auth
    ├── GET/POST /api/accounts
    └── POST /api/transactions
         │
         ▼
   Express Router (/api)          ← Express Node.js Backend
         │
         ▼
   Middleware Layer
   ├── Auth Middleware (JWT Verify)
   └── Fraud Middleware (Pre-Tx Check)
         │
         ▼
   Controller Layer (Business Logic)
   ├── Auth Controller
   ├── Account Controller
   └── Transaction Controller (Atomic Sessions)
         │
         ▼
   Service Layer
   ├── Email Service (Nodemailer)
   └── Fraud Service (5-Rule Engine)
         │
         ▼
   MongoDB Collections
   ├── Users & Blacklist
   ├── Accounts
   ├── Immutable Ledger
   ├── Transactions
   └── Fraud Alerts
         │
         ▼
   External: Gmail SMTP
```

---

## Layer Breakdown

### 1. Client Layer

The **Client App** is any consumer of the API (web SPA, mobile app, or third-party service). It communicates with the backend over HTTP via three primary endpoint groups:

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/auth` | POST | Register or log in; receive a JWT |
| `/api/accounts` | GET / POST | Retrieve or create accounts |
| `/api/transactions` | POST | Initiate a debit/credit transaction |

---

### 2. API Gateway & Routing

The **Express Router** (`/api`) is the single entry point for all incoming requests. It is responsible for:

- Parsing incoming JSON request bodies
- Dispatching requests to the appropriate middleware chain and controller
- Returning HTTP responses back to the client

All three endpoint groups funnel through this router before any business logic is executed.

---

### 3. Middleware Layer

Middleware runs on every protected request, in the following order:

#### Auth Middleware (JWT Verify)

Validates the `Authorization: Bearer <token>` header on each request. If the token is missing, expired, or tampered with, the request is rejected with a `401 Unauthorized` response before reaching any controller. On success, the decoded user payload is attached to the request context.

#### Fraud Middleware (Pre-Transaction Check)

Executes **before** any transaction is processed. It calls the Fraud Service to evaluate the incoming request against the 5-rule engine (see [Fraud Detection Flow](#fraud-detection-flow)). If a rule is triggered, the middleware can:

- Block the transaction and return an error to the client
- Fire an alert email asynchronously via the Email Service
- Log the alert to the `Fraud Alerts` MongoDB collection

This middleware only applies to transaction requests and runs after JWT verification.

---

### 4. Controller Layer (Business Logic)

Controllers contain the core application logic and are kept intentionally thin — they orchestrate operations between the data layer and the service layer without embedding infrastructure concerns.

#### Auth Controller

Handles user registration and login. On registration, it hashes the user's password, persists the record to the `Users & Blacklist` collection, and triggers a **Registration Email** via the Email Service. On login, it validates credentials and issues a signed JWT.

#### Account Controller

Manages account creation and retrieval. It **aggregates balance** by reading from the `Accounts` collection, computing the current balance from associated ledger entries. Account records are stored in the `Accounts` collection.

#### Transaction Controller (Atomic Sessions)

The most critical controller in the system. It executes transactions in **three steps using an ACID-compliant MongoDB session**:

1. **Creates the Transaction** — records the intent in the `Transactions` collection
2. **Creates DEBIT/CREDIT entries** — writes double-entry records to the `Immutable Ledger`
3. **Commits the ACID Session** — atomically commits both writes; if either fails, the entire session is rolled back

On success, a **Receipt Email** is dispatched asynchronously via the Email Service.

---

### 5. Service Layer (Async & External)

Services handle side effects and external integrations, decoupled from the main request lifecycle.

#### Email Service (Nodemailer)

Sends transactional emails using **Nodemailer with OAuth2** over Gmail SMTP. It handles three types of emails:

- **Registration Email** — triggered by the Auth Controller after successful signup
- **Receipt Email** — triggered by the Transaction Controller after a committed transaction
- **Fraud Alert Email** — triggered by the Fraud Middleware when a suspicious transaction is detected

All email dispatch is asynchronous and non-blocking.

#### Fraud Service (5-Rule Engine)

A rules-based engine that evaluates transactions against five configurable fraud detection rules (e.g., velocity checks, blacklist matching, amount thresholds). It is invoked by the Fraud Middleware pre-transaction and operates synchronously within that middleware call. Flagged events are logged to the `Fraud Alerts` MongoDB collection and can trigger alert emails.

---

### 6. Data Layer (MongoDB)

The system uses **MongoDB** as its primary database with the following collections:

| Collection | Purpose |
|---|---|
| `Users & Blacklist` | Stores user credentials and a blacklist of blocked users/IPs |
| `Accounts` | Stores account metadata and ownership |
| `Immutable Ledger` | Append-only double-entry accounting records (DEBIT/CREDIT) |
| `Transactions` | Transaction records linking accounts, amounts, and timestamps |
| `Fraud Alerts` | Log of all fraud rule violations for audit and review |

The `Immutable Ledger` and `Transactions` collections are written together within a single MongoDB ACID session, guaranteeing consistency even in the event of partial failures.

---

### 7. External Services

| Service | Protocol | Purpose |
|---|---|---|
| Gmail SMTP | OAuth2 / SMTP | Outbound email delivery for registration, receipts, and fraud alerts |

The Gmail integration uses OAuth2 tokens (rather than plain credentials) to authenticate Nodemailer, improving security and enabling token rotation without credential changes.

---

## Key Flows

### Authentication Flow

```
Client → POST /api/auth
  → Express Router
  → Auth Controller
    → Hash password / validate credentials
    → Read/Write: Users & Blacklist (MongoDB)
    → [On Register] → Email Service → Gmail SMTP (Registration Email)
  ← JWT token returned to Client
```

---

### Account Management Flow

```
Client → GET|POST /api/accounts
  → Express Router
  → Auth Middleware (JWT Verify)
  → Account Controller
    → Aggregate balance from Accounts collection
    → Read/Write: Accounts (MongoDB)
  ← Account data returned to Client
```

---

### Transaction Flow

```
Client → POST /api/transactions
  → Express Router
  → Auth Middleware (JWT Verify)
  → Fraud Middleware (Pre-Tx Check)
    → Fraud Service (5-Rule Engine)
      → [If flagged] → Email Service → Gmail SMTP (Alert Email)
      → [If flagged] → Write: Fraud Alerts (MongoDB)
  → Transaction Controller (Atomic Session)
    → 1. Write: Transactions (MongoDB)
    → 2. Write: Immutable Ledger (DEBIT/CREDIT entries)
    → 3. Commit ACID session
    → Email Service → Gmail SMTP (Receipt Email)
  ← Transaction result returned to Client
```

---

### Fraud Detection Flow

The Fraud Service implements a **5-rule engine** evaluated synchronously during the pre-transaction middleware phase. Rules may include (but are not limited to):

1. **Blacklist check** — reject transactions from blacklisted users or accounts
2. **Velocity check** — flag accounts exceeding a transaction frequency threshold
3. **Amount threshold** — flag transactions above a configurable limit
4. **Geographic anomaly** — detect unusual origin patterns (if IP/location context is available)
5. **Repeated failure** — flag accounts with repeated failed transaction attempts

When any rule triggers, the Fraud Middleware can either **block** the transaction outright or **allow-and-flag** it for review, depending on the rule severity configuration.

---

## Design Decisions

**ACID transactions for financial writes.** The Transaction Controller uses MongoDB multi-document ACID sessions to ensure that ledger entries and transaction records are always written together or not at all. This prevents partial writes that could corrupt account balances.

**Immutable Ledger.** Rather than updating account balances in place, the system appends DEBIT/CREDIT records to a ledger. Balances are computed by aggregating ledger entries. This preserves a full audit trail and makes forensic review straightforward.

**Pre-transaction fraud gating.** Fraud detection runs as middleware before the Transaction Controller is invoked, meaning fraudulent requests never touch the ledger. This is preferable to post-hoc detection for a financial system.

**Async email delivery.** All email dispatch is non-blocking. Transaction commits do not wait for email confirmation, keeping API response times low and decoupling email reliability from transaction reliability.

**JWT-based stateless auth.** Using JWTs avoids server-side session storage, making the backend horizontally scalable without shared session infrastructure.

---

## Security Considerations

- **JWT secrets** should be stored in environment variables and rotated periodically. Token expiry should be short-lived (e.g., 15–60 minutes) with refresh token support if needed.
- **Blacklist collection** enables immediate revocation of compromised users without waiting for token expiry.
- **OAuth2 for Gmail SMTP** avoids storing plaintext email passwords and supports credential rotation.
- **MongoDB ACID sessions** prevent race conditions in concurrent transaction writes.
- **Fraud Middleware** acts as a hard gate, ensuring no transaction bypasses fraud evaluation regardless of which controller handles the request.
- All sensitive fields (passwords, tokens) should be excluded from logs and API responses.
