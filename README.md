# Async Task Processor

A reliable, production-oriented asynchronous task processing service. Built with **Express**, **BullMQ**, **Redis**, **PostgreSQL**, and **Prisma ORM** — with a clear migration path to AWS (Lambda + SQS + DynamoDB).

---

## Table of Contents

- [Architecture](#architecture)
- [Retry Strategy](#retry-strategy)
- [How to Run](#how-to-run)
- [API Reference](#api-reference)
- [CI/CD Pipeline](#cicd-pipeline)
- [AWS Migration Path](#aws-migration-path)
- [Known Limitations](#known-limitations)

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        CLIENT                               │
└────────────────────────┬────────────────────────────────────┘
                         │  POST /api/v1/tasks
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                   EXPRESS API SERVER                        │
│                                                             │
│  1. Validate input (Zod)                                    │
│  2. Check for duplicate taskId (idempotency)                │
│  3. Persist task to PostgreSQL  →  status: PENDING          │
│  4. Enqueue job to BullMQ/Redis                             │
│  5. Return 202 immediately                                  │
└────────────┬────────────────────────┬───────────────────────┘
             │                        │
             ▼                        ▼
    ┌─────────────────┐      ┌─────────────────┐
    │   PostgreSQL    │      │  Redis (BullMQ) │
    │   (task state)  │      │  (job queue)    │
    └─────────────────┘      └────────┬────────┘
                                      │  job picked up
                                      ▼
┌─────────────────────────────────────────────────────────────┐
│                   BULLMQ WORKER PROCESS                     │
│                                                             │
│  1. Update status → PROCESSING                              │
│  2. Simulate work (500–1500ms)                              │
│  3. ~30% random failure                                     │
│     ├── Success → status: COMPLETED                         │
│     └── Failure → BullMQ reschedules retry                  │
│                   (exponential backoff)                     │
│                                                             │
│  After max retries exhausted:                               │
│     └── status: FAILED, errorMessage persisted              │
└─────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | File | Responsibility |
|-----------|------|----------------|
| API Server | `src/server.ts` | HTTP entry point, middleware, route wiring |
| Task Router | `src/api/tasks.router.ts` | Request handling, validation, response shaping |
| Validators | `src/api/validators/` | Zod schemas for POST body and GET query params |
| Queue | `src/queue/task.queue.ts` | BullMQ queue config, `enqueueTask()` helper |
| Redis | `src/lib/redis.ts` | IORedis connection singleton |
| Worker | `src/worker/task.worker.ts` | BullMQ worker process, lifecycle event logging |
| Processor | `src/worker/processor.ts` | Core task logic: failure simulation, DB updates |
| Prisma | `src/db/prisma.ts` | Database client singleton |
| Config | `src/lib/config/env.ts` | Typed environment config with Zod validation |
| Logger | `src/lib/logger.ts` | Pino structured logger |

### Key Design Decisions

**Separate processes for API and worker** — The HTTP server and the background worker run as independent processes. This mirrors how they would be deployed in production (API Gateway/Lambda for HTTP, separate Lambda for queue consumer). It also means the worker can scale independently of the API.

**Idempotent task submission** — If a `taskId` is submitted twice, the second request returns the existing task state (`200`) instead of creating a duplicate. If `taskId` is omitted, a UUID is auto-generated.

**Prisma transaction on create** — The `POST /tasks` handler wraps DB creation and queue enqueue in a transaction-like try/catch. If the queue is unavailable after the task is persisted, the caller receives a `500` and can retry — the DB row acts as a durable record.

**Framework-agnostic processor** — `processor.ts` receives a BullMQ `Job` object but contains no framework-specific code. It could run inside a Lambda handler with minimal wrapping.

---

## Retry Strategy

### Configuration

| Parameter | Value |
|-----------|-------|
| Max retries | 2 (3 total attempts) |
| Backoff type | Exponential |
| Backoff base delay | 5 000 ms |
| Retry delays | ~5s after attempt 1, ~25s after attempt 2 |
| Failure simulation rate | ~30% per attempt |

### How it works

BullMQ manages all retry scheduling in Redis. The processor itself only needs to `throw` — it never decides when to retry.

```
Attempt 1 (initial)
  ├── Success (70%)  → status: COMPLETED
  └── Failure (30%)  → BullMQ waits ~5s, schedules Attempt 2

Attempt 2 (retry 1)
  ├── Success (70%)  → status: COMPLETED
  └── Failure (30%)  → BullMQ waits ~25s, schedules Attempt 3

Attempt 3 (retry 2 — final)
  ├── Success (70%)  → status: COMPLETED
  └── Failure (30%)  → status: FAILED, errorMessage persisted
                        no further retries
```

### Re-throw pattern

The processor always re-throws the error after logging it and (on the final attempt) updating the DB. This keeps retry scheduling entirely within BullMQ — the business logic never decides *when* to retry, only *that* it failed.

```ts
// processor.ts — simplified
} catch (err) {
  if (isLastAttempt) {
    await prisma.task.update({ data: { status: 'FAILED', errorMessage } });
  }
  throw err; // BullMQ handles the rest
}
```

### Why exponential backoff?

Immediate retries hammer a service that's already struggling. Exponential backoff (5s → 25s) gives transient issues time to resolve — network blips, momentary DB overload — without keeping the job queue backed up.

---

## How to Run

### Prerequisites

- [Node.js](https://nodejs.org/) >= 20
- [Docker](https://www.docker.com/) + Docker Compose

### 1. Clone the repository

```bash
git clone <your-repo-url>
cd async-task-processor
```

### 2. Configure environment

```bash
cp .env.example .env
# The defaults work with the Docker Compose services below.
# Edit .env only if you need custom ports or credentials.
```

### 3. Start infrastructure (PostgreSQL + Redis)

```bash
docker-compose up -d
```

### 4. Install dependencies

```bash
npm install
```

### 5. Generate Prisma client and run migrations

```bash
npm run prisma:generate
npm run prisma:migrate
```

### 6. Start the API server and worker

**Option A — together (recommended for development):**
```bash
npm run dev:all
```

**Option B — in separate terminals (mirrors production separation):**
```bash
# Terminal 1 — API server
npm run dev

# Terminal 2 — background worker
npm run dev:worker
```

The API is available at `http://localhost:3000`.
Swagger UI is available at `http://localhost:3000/api-docs`.

---

## API Reference

### POST /api/v1/tasks — Submit a task

```bash
curl -X POST http://localhost:3000/api/v1/tasks \
  -H "Content-Type: application/json" \
  -d '{"taskId": "my-task-001", "payload": {"user": "alice", "action": "send-email"}}'
```

`taskId` is optional — a UUID is auto-generated if omitted.

**202 Accepted** (new task):
```json
{
  "message": "Task accepted",
  "task": {
    "id": 1,
    "taskId": "my-task-001",
    "payload": { "user": "alice", "action": "send-email" },
    "status": "PENDING",
    "retryCount": 0,
    "errorMessage": null,
    "createdAt": "2024-06-01T12:00:00.000Z",
    "updatedAt": "2024-06-01T12:00:00.000Z"
  }
}
```

**200 OK** (task already exists — idempotent):
```json
{ "message": "Task already submitted", "task": { ... } }
```

---

### GET /api/v1/tasks/:taskId — Get task status

```bash
curl http://localhost:3000/api/v1/tasks/my-task-001
```

Poll this endpoint to observe the task moving through `PENDING → PROCESSING → COMPLETED / FAILED`.

---

### GET /api/v1/tasks — List tasks

```bash
# All tasks (paginated)
curl "http://localhost:3000/api/v1/tasks?limit=20&offset=0"

# Filter by status
curl "http://localhost:3000/api/v1/tasks?status=FAILED"
curl "http://localhost:3000/api/v1/tasks?status=PROCESSING"
```

Query params: `status` (`PENDING` | `PROCESSING` | `COMPLETED` | `FAILED`), `limit` (default 20, max 100), `offset` (default 0).

---

### GET /api/v1/tasks/failed — Inspect all failed tasks

```bash
curl http://localhost:3000/api/v1/tasks/failed
```

Returns all `FAILED` tasks ordered by most recently updated, including `errorMessage` and `retryCount` for each. This is the primary observability endpoint for debugging permanently failed tasks.

---

### GET /health — Health check

```bash
curl http://localhost:3000/health
# { "status": "ok", "timestamp": "..." }
```

---

## CI/CD Pipeline

The repository ships with two GitHub Actions workflows.

### `ci.yml` — Continuous Integration

Runs on **every push** to any branch and every **pull request** to `main` or `develop`.

```
typecheck ──┐
            ├── build  (only if both pass)
test ───────┘
```

| Job | What it does |
|-----|-------------|
| `typecheck` | Installs deps, generates Prisma client, runs `tsc --noEmit` |
| `test` | Installs deps, generates Prisma client, runs `vitest --coverage`, uploads coverage HTML artifact |
| `build` | Runs after typecheck + test pass, compiles TypeScript, uploads `dist/` artifact |

> **Why no real database in CI?** All tests mock Prisma and BullMQ with `vi.mock()`. The only reason `prisma generate` runs is to produce the TypeScript types in `src/generated/prisma/`. A dummy `DATABASE_URL` is sufficient — no real Postgres connection is made.

### `release.yml` — Release Pipeline

Runs only on **push to `main`**.

1. Calls `ci.yml` as a reusable workflow — main is never packaged if any CI job fails.
2. Installs production-only dependencies and builds.
3. Bundles `dist/` + `node_modules/` + Prisma files into a `.tar.gz` artifact tagged with the commit SHA.
4. Deployment steps are included as commented placeholders (ECR push, ECS/Lambda deploy).

### Running tests locally

```bash
npm test                 # single run
npm run test:watch       # watch mode
npm run test:coverage    # with HTML coverage report → ./coverage/
```

---

## AWS Migration Path

The local stack maps directly onto AWS primitives:

| Local | AWS | Notes |
|-------|-----|-------|
| Express API | API Gateway + Lambda | Wrap with `@vendia/serverless-express` — zero business logic changes |
| BullMQ queue | SQS Standard Queue | Replace `enqueueTask()` with `sqs.sendMessage()` |
| BullMQ worker | Lambda (SQS trigger) | `processTaskJob()` becomes the Lambda handler body |
| Redis | Amazon ElastiCache for Redis | Drop-in replacement for `ioredis` |
| PostgreSQL + Prisma | Amazon RDS (PostgreSQL) | Same Prisma schema, change `DATABASE_URL` |
| Retry logic | SQS `maxReceiveCount` + DLQ | Configure redrive policy to match 2-retry behaviour |
| Exponential backoff | SQS visibility timeout | Increase timeout per receive count |
| `GET /tasks/failed` | DLQ + CloudWatch Logs | Query DLQ or use Prisma against RDS |

The processor (`src/worker/processor.ts`) contains **no queue or framework imports** — it receives a plain job object and updates the database. Wrapping it in a Lambda handler requires adding only the event parsing layer.

---

## Known Limitations

| Limitation | Detail |
|------------|--------|
| No auth | Intentionally omitted per assignment scope. In production: API key middleware or Cognito JWT. |
| Single worker instance | The worker runs as one process. In production it would scale horizontally (multiple ECS tasks or Lambda concurrency). |
| No dead-letter queue | BullMQ stores failed jobs in Redis under the failed set. A production system would route these to an alerting pipeline. |
| Retry state split across two stores | `retryCount` in Postgres mirrors BullMQ's internal count in Redis. This is redundant but makes the DB the single source of truth for observability. |
| Task result not persisted | The output of `simulateWork()` is logged but not stored. A real system would persist results or write them to object storage. |
| No graceful shutdown for API | The worker handles `SIGTERM` cleanly; the API server does not have a `server.close()` drain. Acceptable for development, not for production. |
| `prisma.config.ts` datasource | Prisma v7 uses a config file instead of embedding the URL in `schema.prisma`. The `DATABASE_URL` env var must be set before `prisma generate` runs — including in CI. |
