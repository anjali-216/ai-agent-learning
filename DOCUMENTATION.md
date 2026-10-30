# Nexus AI — Complete Technical Documentation

> **Nexus** is a personal Strategic Life Operating System — an AI agent that manages your schedule, remembers personal context, searches the web, and proactively reminds you about upcoming tasks. Built on Node.js, Google Gemini, and Qdrant vector database.

---

## Table of Contents

1. [System Architecture](#1-system-architecture)
2. [Tech Stack](#2-tech-stack)
3. [Project Structure](#3-project-structure)
4. [Core Components](#4-core-components)
   - [agent_module.js — AI Engine](#41-agent_modulejs--ai-engine)
   - [orchestrator.js — Multi-Agent Orchestration](#42-orchestratorjs--multi-agent-orchestration)
   - [server.js — HTTP API](#43-serverjs--http-api)
   - [proactive_engine.js — Background Notifications](#44-proactive_enginejs--background-notifications)
   - [task_db.js — Task Persistence](#45-task_dbjs--task-persistence)
5. [AI Tools Reference](#5-ai-tools-reference)
6. [API Endpoints](#6-api-endpoints)
7. [Vector Memory System](#7-vector-memory-system)
8. [Task Lifecycle](#8-task-lifecycle)
9. [Conflict Detection System](#9-conflict-detection-system)
10. [Recurring Tasks (Frequency)](#10-recurring-tasks-frequency)
11. [Frontend Architecture](#11-frontend-architecture)
12. [Utility Scripts](#12-utility-scripts)
13. [LangChain Comparison Module](#13-langchain-comparison-module)
14. [Environment Configuration](#14-environment-configuration)
15. [Running the Project](#15-running-the-project)
16. [Data Flow Diagrams](#16-data-flow-diagrams)

---

## 1. System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Browser (index.html)                  │
│  ┌──────────┐  ┌──────────────┐  ┌─────────────────────┐   │
│  │ Chat UI  │  │  Task Board  │  │  Notification Toast  │   │
│  └────┬─────┘  └──────┬───────┘  └──────────┬──────────┘   │
│       │ POST /chat    │ REST /api/tasks        │ SSE          │
└───────┼───────────────┼───────────────────────┼─────────────┘
        │               │                       │
┌───────▼───────────────▼───────────────────────▼─────────────┐
│                     server.js (Express)                       │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────────┐  │
│  │  /chat SSE   │  │  /api/tasks  │  │  /notifications   │  │
│  │  streaming   │  │  CRUD        │  │  SSE heartbeat    │  │
│  └──────┬───────┘  └──────┬───────┘  └───────────────────┘  │
│         │                 │                                   │
│  ┌──────▼───────┐  ┌──────▼───────┐                         │
│  │orchestrator  │  │  enrichTask  │                         │
│  │    .js       │  │  (AI brief)  │                         │
│  └──────┬───────┘  └──────┬───────┘                         │
└─────────┼─────────────────┼─────────────────────────────────┘
          │                 │
┌─────────▼─────────────────▼─────────────────────────────────┐
│                    agent_module.js                            │
│                                                               │
│  MODEL_PRIORITY (sequential fallback):                        │
│  gemini-2.5-flash-lite → gemini-2.0-flash →                  │
│  gemini-2.5-flash → gemini-2.0-flash-lite → gemini-2.5-pro   │
│                                                               │
│  Tool Loop (max 6 iterations):                                │
│  LLM → function_call → tool execution → LLM → ...            │
└─────────┬─────────────────────────────────────────────────────┘
          │
    ┌─────┴────────────────────┐
    │                          │
┌───▼────────┐    ┌────────────▼───────┐
│  Qdrant    │    │   tasks.json /      │
│  Vector DB │    │   chat_history.json │
│  :6333     │    │   (flat-file DB)    │
│            │    └────────────────────┘
│ collections│
│ - documents│    ┌────────────────────┐
│ - user_mem │    │  proactive_engine  │
└────────────┘    │  (cron, 60s tick)  │
                  │  → broadcastNotif  │
                  └────────────────────┘
```

### Key Design Decisions

| Decision | Rationale |
|---|---|
| Sequential model fallback (not `Promise.race`) | One failing model shouldn't race against another rate-limited model; sequential is more reliable under quota pressure |
| Flat-file JSON for tasks | Zero infrastructure overhead; fast reads/writes for single-user workload |
| SSE for chat streaming | Native browser API, no WebSocket setup needed, works behind HTTP/2 |
| Rule-based conflict detection | No AI call needed for scheduling logic; AI only enriches the suggestion message |
| `<final_reply>` tag wrapper | Forces the model to separate internal reasoning from the user-facing response |

---

## 2. Tech Stack

| Layer | Technology | Purpose |
|---|---|---|
| Runtime | Node.js | Server-side JavaScript |
| Web Framework | Express.js | HTTP routing, middleware |
| AI Provider | Google Generative AI (`@google/generative-ai`) | Gemini model API |
| Vector DB | Qdrant (`@qdrant/js-client-rest`) | Semantic memory storage |
| Web Search | `google-it` | Live web search tool |
| Frontend | Vanilla HTML/CSS/JS | No framework — minimal dependency |
| Markdown | `marked.js` (CDN) | Chat response rendering |
| Environment | `dotenv` | API key loading |

### Gemini Models Used

```
Primary:   gemini-2.5-flash-lite   ← fastest, cheapest, tried first
Fallback1: gemini-2.0-flash
Fallback2: gemini-2.5-flash
Fallback3: gemini-2.0-flash-lite
Fallback4: gemini-2.5-pro          ← most capable, last resort

NOTE: gemini-1.5-x models return 404 for this API key — excluded entirely.
```

---

## 3. Project Structure

```
ai-agent/
│
├── server.js              # Express server, all API routes, task enrichment, conflict detection
├── agent_module.js        # Core AI engine: tool loop, model fallback, system prompt
├── orchestrator.js        # Multi-agent: Researcher + Critic quality gate + memory recall
├── proactive_engine.js    # Background cron: fires notifications for upcoming tasks
├── task_db.js             # Task CRUD on tasks.json
│
├── index.html             # Single-page frontend: dashboard, chat, task modal, conflict modal
│
├── tasks.json             # Persistent task store (JSON, auto-created, git-ignored)
├── chat_history.json      # Chat session history (JSON, auto-created, git-ignored)
├── agent_logs.txt         # Append-only agent execution log (git-ignored)
│
├── createCollection.js    # One-time setup: creates Qdrant 'documents' collection
├── scripts/               # Debug utilities (e.g. peek_data.js prints one vector from Qdrant)
│
├── langchain/
│   ├── manual_agent.js    # Educational: tool loop written manually with LangChain SDK
│   └── langchain_agent.js # Educational: same agent with LangGraph (much shorter)
│
└── .gitignore             # Excludes: node_modules, .env, runtime data, sample.pdf
```

---

## 4. Core Components

### 4.1 `agent_module.js` — AI Engine

The lowest-level AI execution layer. Everything that needs to call Gemini goes through here.

#### System Prompt (`SYSTEM_INSTRUCTION`)

Injected fresh on every call (includes live IST timestamp):

```
Identity:   Nexus — Strategic Life OS, not a chatbot
User ID:    Always "default" for all tool calls
Timezone:   All user times are IST; must convert IST → UTC before schedule_task
Briefings:  4–6 sentence strategic briefing required for every scheduled task
Priorities: Health > Wealth > Career > Relationships > Social/Leisure
Format:     Natural prose, no ## headers, bold only for names/times/numbers
Tags:       Always wrap reply in <final_reply>...</final_reply>
```

#### `runAgent(userInput, history, onStatus)`

Full agent with tools, system prompt, and model fallback.

```
1. Iterate through MODEL_PRIORITY (sequential, not parallel)
2. For each model, call tryModel()
3. On rate limit (429/503): wait 800ms, try next model
4. On model-not-found (404): skip immediately
5. Other errors: log and skip
6. If all models fail: throw "All models failed"
```

#### `tryModel(modelName, userInput, history, onStatus)`

Single model execution with tool loop:

```
1. Create model with: systemInstruction, tools, maxOutputTokens=2048, temperature=0.7
2. Start chat with history
3. Send user message
4. TOOL LOOP (max 6 iterations):
   a. Check response.functionCalls()
   b. For each call: look up TOOLS[name] → execute → collect result
   c. Send all tool results back to model
   d. Get next response
5. Return final text response
```

#### `runAgentSimple(userInput)`

Lightweight version — no tools, no system prompt. Used for:
- Proactive engine notification text
- Conflict modal suggestion text
- Critic quality checks

```javascript
// Same model priority list, but generateContent() not startChat()
// No tool declarations, no history, no system instruction
// 4 models tried sequentially, no 800ms delay between
```

#### Tool Loop Safety

- Max 6 iterations prevents infinite tool loops
- Every tool call wrapped in `try/catch` — errors returned as strings to the model (not thrown), so the model can acknowledge the failure and continue
- Unknown tool names return `"Unknown tool requested: {name}"` gracefully

---

### 4.2 `orchestrator.js` — Multi-Agent Orchestration

Adds a quality gate on top of the base agent. Only used for the chat endpoint.

#### Pipeline

```
User message
    │
    ▼
recallMemories(query)          ← Qdrant semantic search, 4s timeout
    │
    ▼
Enrich query with memory context
    │
    ▼
runAgent(enrichedQuery)        ← Main researcher agent
    │
    ▼
needsAudit(query)?             ← Is this complex enough to audit?
   YES          NO
    │            └──────────────────────────────────────┐
    ▼                                                   │
runCritic()    ← Lightweight audit, 5s total timeout    │
    │                                                   │
    ├── "APPROVED" ─────────────────────────────────────┤
    │                                                   │
    └── "REDO: reason" → runAgent(fixPrompt) ───────────┤
                                                        │
                                                        ▼
                                               extractFinalReply()
                                                        │
                                                        ▼
                                               Return to /chat endpoint
```

#### `needsAudit(query)` — When critic runs

The critic only activates for genuinely complex queries. Simple scheduling or greetings skip it entirely (saves 2-5 seconds per request).

```javascript
// Critic triggers when ALL of:
// 1. Query is longer than 30 characters
// 2. Contains: research | analyze | audit | compare | evaluate |
//              explain in detail | comprehensive | detailed report |
//              what is | who is | how does
```

#### `runCritic()`

Uses `CRITIC_MODELS` (same as main but lighter models first) with a hard 5-second `Promise.race` timeout. Verdict is either `"APPROVED"` or `"REDO: {one line reason}"`. Auto-approves on timeout or if all models fail.

#### `recallMemories(query)`

```javascript
// 1. Embed the user query with gemini-embedding-001
// 2. Search Qdrant "user_memories" collection, limit: 4
// 3. Format as "- {memory text}" lines
// 4. 4-second timeout — skipped silently if Qdrant is down
```

#### `extractFinalReply(rawText)`

Strips internal model reasoning and returns only the user-facing content:

```javascript
// 1. Extract <final_reply>...</final_reply> if present
// 2. Strip meta-text prefixes: "Nexus:", "Researcher:", "Thoughts:", etc.
// 3. If multiple paragraphs contain meta-text, take the last clean paragraph
```

---

### 4.3 `server.js` — HTTP API

Express application with 7 routes and 2 SSE streams.

#### IST ↔ UTC Conversion

```javascript
// parseIstToUtc(istStr)
// Handles formats:
//   "2026-06-25 04:04 PM"  →  "2026-06-25T10:34:00.000Z"
//   "2026-06-25 16:04"     →  "2026-06-25T10:34:00.000Z"
// Appends "+05:30" offset before parsing — avoids DST guessing
```

#### `enrichTask(title, description, time, existingSchedule)`

AI-powered task enhancement called when a task is created via the UI form. Returns a structured response:

```
BRIEFING: {4-6 sentences covering prep, attire, tips, conflicts}
PRIORITY: HIGH | MEDIUM | LOW
TIME_IST: YYYY-MM-DD HH:MM AM/PM   ← only used if no time was provided
```

The enriched briefing becomes the task's `description` field (shown in the "View Briefing" modal).

#### `findNextClearSlot(fromTime, pending)`

Rule-based alternative time finder. Used as unconditional fallback so conflict suggestions always work even when AI is rate-limited.

```javascript
// Starting 2 hours after the conflicting task:
// Try candidate time → check if any pending task is within 90 minutes
// If blocked: advance by 2 hours, retry
// Max 12 attempts → last resort: same time tomorrow (+24h)
```

---

### 4.4 `proactive_engine.js` — Background Notifications

Runs on a 60-second tick after server starts (first check: 8 seconds after boot).

#### Timing Windows

```
LOOKAHEAD_MS  = 2 minutes    ← notify if task starts within 2 min
GRACE_MS      = 1 minute     ← notify if task started up to 1 min ago
RENOTIFY_GAP  = 10 minutes   ← won't re-notify same task within 10 min
STALE_TASK_MS = 30 minutes   ← auto-archives tasks missed by 30+ min (no notification)
```

#### Execution Flow Per Tick

```
1. Read tasks.json
2. Auto-archive stale tasks (pending + time > 30min ago → status: "notified")
3. Find "due now" tasks: status=pending AND -1min ≤ taskTime ≤ +2min
4. Filter out recently notified tasks (lastNotified < 10min ago)
5. If due tasks found:
   a. Call runAgentSimple() for a short natural reminder (≤15 words)
   b. broadcastNotification() via SSE to all connected clients
   c. Update task state:
      - remaining > 1: decrement remaining, advance time by intervalHours
      - remaining ≤ 1: status = "notified" (permanently stops future checks)
6. Write updated tasks.json
```

#### Notification Prompt Rules

```
- Under 15 words
- Sounds like a WhatsApp message from a friend
- DO NOT moralize, lecture, or add safety warnings
- Wrapped in <reminder>...</reminder> tags
```

#### Fallback (AI fails)

Plain `"{title} is starting now."` — sent without AI, all tasks still marked notified.

---

### 4.5 `task_db.js` — Task Persistence

Simple file-based task store using `tasks.json`.

#### Task Schema

```javascript
{
  id:           "1750000000000",    // Date.now() timestamp string
  title:        "Team Standup",
  description:  "...",             // Strategic briefing from enrichTask()
  time:         "2026-06-25T04:30:00.000Z",  // UTC ISO 8601
  status:       "pending",         // pending | notified | done
  priority:     "high",            // high | medium | low
  frequency:    3,                 // total occurrences (1 = one-time)
  remaining:    3,                 // countdown, decremented by proactive engine
  intervalHours: 24,               // hours between recurrences
  category:     "work"             // gym | work | health | personal | general
}
```

#### `addTask(userId, title, description, time, priority, frequency, intervalHours, category)`

Reads → appends → writes `tasks.json`. Returns the new task object (which is already persisted to disk including `category`).

#### Storage Format

```json
{
  "default": [
    { "id": "...", "title": "...", ... },
    { "id": "...", "title": "...", ... }
  ]
}
```

---

## 5. AI Tools Reference

Nine tools are available to the main agent. All are defined in `TOOL_DECLARATIONS` and implemented in `TOOLS` map in `agent_module.js`.

| Tool | Purpose | Key Behavior |
|---|---|---|
| `search_knowledge_base` | Semantic search in user's uploaded documents | Embeds query → Qdrant cosine search on "documents" collection |
| `search_the_web` | Live web search | `google-it` npm, limit 3 results, 6s timeout |
| `calculate` | Math evaluation | Sanitized `eval()` — only digits and `+-*/.()%` |
| `get_current_time` | Current IST time | `toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })` |
| `save_to_file` | Write text to `output/` directory | Creates directory if missing; basename sanitized |
| `schedule_task` | Add a task to tasks.json | Calls `addTask()` directly; returns IST-formatted confirmation |
| `get_schedule` | Fetch all non-done tasks sorted by time | Returns formatted list with priority and status |
| `save_user_memory` | Embed + store a user fact in Qdrant | Collection: "user_memories"; vector: 768-dim from gemini-embedding-001 |
| `search_user_memory` | Recall relevant user facts | Qdrant search filtered by userId |

### Tool Error Handling

Every tool is wrapped in `try/catch` inside `tryModel()`. If a tool throws (network down, Qdrant offline, etc.), the error message is returned as a string to the model. The model then informs the user or tries a different approach — the agent never crashes.

---

## 6. API Endpoints

### `GET /`
Serves `index.html` (the full frontend).

### `GET /notifications` — SSE Stream
Persistent connection for push notifications. Heartbeat every 20 seconds (`{"type":"hb"}`). All connected clients stored in `notificationClients` Set.

**Event payload:**
```json
{
  "type": "task_reminder",
  "title": "Task name",
  "message": "Short reminder text",
  "taskId": "1750000000000"
}
```

### `POST /chat` — SSE Stream
Streaming chat with the AI orchestrator.

**Request:** `{ message: string, sessionId: string }`

**SSE event types:**
```json
{ "type": "status",  "message": "Thinking..." }
{ "type": "status",  "message": "Running: search the web..." }
{ "type": "final",   "answer": "The final markdown response" }
{ "type": "error",   "message": "I ran into an issue..." }
```

### `GET /api/tasks/:userId`
Returns all tasks for a user.

**Response:** `{ tasks: Task[] }`

### `POST /api/tasks/preview` — Conflict Check
Checks for scheduling conflicts before creating a task. No database writes.

**Request:** `{ userId: string, title: string, time: string (ISO UTC) }`

**Response (no conflict):** `{ conflict: false }`

**Response (conflict):**
```json
{
  "conflict": true,
  "conflictWith": "Team Standup",
  "conflictTime": "25/06/2026, 10:30:00 am",
  "suggestion": "Team Standup is at 10:30 AM, that slot's taken. How about 12:30 PM instead?",
  "suggestedTime": "2026-06-25T07:00:00.000Z",
  "suggestedTimeIST": "25/06/2026, 12:30:00 pm"
}
```

`suggestedTime` is **always** set (rule-based fallback guarantees it). AI upgrades the suggestion message if it responds within 5 seconds.

### `POST /api/tasks` — Create Task
Creates a task with AI-generated strategic briefing.

**Request:**
```json
{
  "userId": "default",
  "title": "Team Standup",
  "description": "Optional extra details",
  "time": "2026-06-25T04:30:00.000Z",
  "category": "work",
  "frequency": 1
}
```

**Response:** `{ task: Task }`

The `description` in the response is the AI-generated strategic briefing, not the user's input.

### `PATCH /api/tasks/:userId/:taskId/status`
Updates a task's status.

**Request:** `{ status: "done" | "pending" | "notified" }`

### `DELETE /api/tasks/:userId/:taskId`
Deletes a task by ID.

---

## 7. Vector Memory System

Nexus uses Qdrant (vector database) for two separate memory stores.

### Collections

| Collection | Content | Dimensions | Distance |
|---|---|---|---|
| `documents` | User-uploaded PDFs/docs | 3072 | Cosine |
| `user_memories` | Personal facts about the user | 768 | Cosine |

### Embedding Model

`gemini-embedding-001` — used for both storing and querying.

### How Memory Works

**Saving a fact** (via `save_user_memory` tool):
```
User says "my name is Setia"
→ Agent calls save_user_memory({ userId: "default", memory: "User's name is Setia" })
→ Embed "User's name is Setia" → 768-dim vector
→ Store in "user_memories" with payload { userId, memory }
```

**Recalling facts** (on every chat message):
```
User asks anything
→ orchestrator calls recallMemories(userQuery)
→ Embed query → Cosine search → top 4 matches
→ Prepended to context as "[WHAT I REMEMBER ABOUT YOU]\n- ..."
```

This means personal context (name, preferences, health conditions, goals) is automatically surfaced without the user having to repeat themselves.

### Setting Up Qdrant

Qdrant must be running locally on port 6333 before starting the server.

```bash
# Run Qdrant via Docker
docker run -p 6333:6333 qdrant/qdrant

# One-time: create the documents collection
node createCollection.js

# Debug: verify data in collection
node scripts/peek_data.js
```

---

## 8. Task Lifecycle

```
[User fills task modal]
        │
        ▼
POST /api/tasks/preview
        │
        ├── No conflict → skip to scheduling
        │
        └── Conflict detected
                │
                ├── findNextClearSlot() → suggestedTime (always set)
                ├── Try AI suggestion (5s timeout) → upgrades if valid
                └── Show conflict modal
                        │
                        ├── "Schedule Anyway" → POST /api/tasks (original time)
                        └── "Use Suggested Time" → POST /api/tasks (suggestedTime)

[POST /api/tasks]
        │
        ▼
enrichTask()
        │   Current schedule context passed to AI
        │   AI writes: BRIEFING + PRIORITY + TIME_IST
        │
        ▼
addTask() → tasks.json
        │
        ▼
Task status: "pending"

[proactive_engine tick — every 60s]
        │
        ├── Task within time window? → notify → mark status
        │       remaining > 1: advance time, decrement remaining
        │       remaining = 1: status = "notified"
        │
        └── Task > 30min stale without notification → status = "notified" (silent)

[User marks done]
        │
        ▼
PATCH /api/tasks/:userId/:taskId/status → status = "done"
```

---

## 9. Conflict Detection System

Conflict detection is **entirely rule-based** — no AI involved in detecting or calculating the alternative time. AI only writes the human-readable suggestion message.

### Conflict Window

A conflict is detected when any existing pending task is within **90 minutes** of the requested time (in either direction):

```javascript
const diff = Math.abs(new Date(existingTask.time) - requestedTime) / 60000;
return diff < 90;
```

### Alternative Time Algorithm (`findNextClearSlot`)

```
Start: 2 hours after the conflicting task's time
Loop up to 12 times:
  candidate = current_candidate
  Check: is any pending task within 90 minutes of candidate?
    No → return candidate  ✓
    Yes → add 2 hours, retry
After 12 attempts → return (conflictTime + 24 hours)  [last resort]
```

Maximum scan window: 12 × 2h = 24 hours ahead (before last resort kicks in).

### Two-Phase Task Creation

The preview call never writes to the database. Only the confirm call does:

```
Phase 1: POST /api/tasks/preview → conflict check + suggestion (no DB write)
Phase 2: POST /api/tasks         → actual task creation with AI briefing
```

This means if the user cancels the conflict modal, nothing is persisted.

---

## 10. Recurring Tasks (Frequency)

### How It Works

When creating a task with `frequency: N`:

```javascript
addTask(..., frequency: 3, intervalHours: 24)
// Stores: { frequency: 3, remaining: 3, intervalHours: 24 }
```

Each time the proactive engine fires for the task:

```
If remaining > 1:
  remaining -= 1
  task.time += intervalHours (24h by default)
  task.status stays "pending"
  // Task will fire again next day at same time

If remaining <= 1:
  task.status = "notified"
  // Task is done — no more notifications
```

**Total notifications = `frequency` value.** The notification fires BEFORE the state update, so all N occurrences are delivered.

### Visible in UI

The task card shows `⟳ Nx left` next to the title when `remaining > 1`, so users can see how many future occurrences remain.

### Interval

`intervalHours` defaults to 24 (daily). Currently only configurable via the AI chat tool (`schedule_task` with `intervalHours` argument). The UI form always uses 24h.

---

## 11. Frontend Architecture

`index.html` is a single self-contained file — no build step, no framework.

### Pages (SPA Navigation)

```javascript
const pages = ['dashboard', 'tasks', 'schedule', 'chat'];
// Navigation toggles page visibility and updates URL hash
// loadTasks() called on every non-chat page switch
```

### State Variables

```javascript
let allTasks = [];          // cached task list from last API call
let selectedCategory = 'general';
let currentFilter = 'all';
let _pendingTask = null;    // task data held while conflict modal is open
let _conflictAltTime = null; // suggested UTC ISO time from preview
```

### Task Card

Each task card renders:
- Priority badge (🔥 STRATEGIC / ⚡ OPERATIONAL / 🧊 FLEXIBLE)
- Title + `⟳ Nx left` for recurring tasks with remaining > 1
- Description snippet + "View Briefing" link (opens briefing modal)
- Category badge (gym/work/health/personal/general)
- Formatted IST time (always in Asia/Kolkata timezone)
- Delete button

### Conflict Modal Flow

```
submitTask()
  → POST /api/tasks/preview
  → conflict: true?
      → closeModal()          ← task modal closes cleanly
      → _pendingTask = data
      → _conflictAltTime = suggestedTime
      → showConflictModal()   ← conflict modal opens

"Use Suggested Time" clicked:
  → useAltTime()
  → taskData.time = _conflictAltTime
  → _scheduleFromConflictModal(taskData, btn, label)
  → Both buttons disabled, spinner shown on clicked button
  → POST /api/tasks
  → Success: closeConflictModal(), loadTasks()
  → Error: shown inline in conflict modal, buttons re-enable

"Schedule Anyway" clicked:
  → forceScheduleTask()
  → _scheduleFromConflictModal(_pendingTask, btn, label)
  → Same flow as above but with original time
```

### Chat Streaming

```javascript
// SSE reader loop
const reader = res.body.getReader();
while (true) {
  const { done, value } = await reader.read();
  // Parse SSE lines → update status badge or render final answer
}
// Final answer rendered with marked.parse() (markdown → HTML)
```

### Proactive Notifications

Browser connects to `GET /notifications` on load. Reconnects automatically on disconnect. Toast notification shown for `task_reminder` events with 10-second auto-dismiss.

---

## 12. Utility Scripts

### `createCollection.js`

One-time setup script. Run once before first use:

```bash
node createCollection.js
```

- Checks if "documents" collection exists
- If yes: deletes it (reset)
- Creates new collection with 3072-dim vectors, Cosine distance
- Used for storing user-uploaded document embeddings

### `scripts/peek_data.js`

Debug inspection tool:

```bash
node scripts/peek_data.js
```

- Connects to Qdrant at localhost:6333
- Fetches 1 document from "documents" collection
- Prints: ID, source filename, 100-char text preview, first 10 vector values
- Useful to verify documents are correctly embedded and stored

---

## 13. LangChain Comparison Module

The `langchain/` directory is **educational** — not used by the main application. It demonstrates the difference between writing an agent tool loop manually vs. using the LangChain/LangGraph framework.

### `manual_agent.js`

Writes every step manually using `@langchain/google-genai`:
- Define tool schemas
- Manage message history array manually
- Write the `while (response.tool_calls?.length > 0)` loop
- Format `ToolMessage` responses manually
- ~88 lines for a 2-tool agent

### `langchain_agent.js`

Same functionality using `createReactAgent` from LangGraph:
- Define tools with `tool()` helper
- `createReactAgent({ llm, tools })` handles the loop automatically
- ~78 lines, but the actual agent logic is ~10 lines

### Key Difference

```
Manual:     You control the while loop, message formatting, tool dispatch
LangGraph:  Framework handles all of that — you just define tools and invoke
```

Both use `gemini-1.5-flash` (for LangChain compatibility — the main agent uses the newer 2.x/2.5 models directly via `@google/generative-ai`).

---

## 14. Environment Configuration

Required `.env` file (never committed — excluded by `.gitignore`):

```env
GEMINI_API_KEY=your_google_gemini_api_key_here
PORT=3000                  # optional, defaults to 3000
```

### Getting a Gemini API Key

1. Go to [Google AI Studio](https://aistudio.google.com)
2. Create a project and generate an API key
3. Paste into `.env` as `GEMINI_API_KEY`

### Port

Default: `3000`. Override with `PORT` env var.

---

## 15. Running the Project

### Prerequisites

- Node.js 18+
- Docker (for Qdrant)
- Gemini API key

### First-Time Setup

```bash
# 1. Install dependencies
npm install

# 2. Create .env
echo "GEMINI_API_KEY=your_key_here" > .env

# 3. Start Qdrant
docker run -d -p 6333:6333 qdrant/qdrant

# 4. Create vector collections (run once)
node createCollection.js

# 5. Start the server
node server.js
```

### Subsequent Runs

```bash
# Make sure Qdrant is running
docker start <qdrant-container-id>

# Start server
node server.js
```

Open `http://localhost:3000` in browser.

### Logs

Agent execution is logged to both console and `agent_logs.txt`:

```
[2026-06-25, 4:30:00 pm] --- REQUEST: schedule my standup for 10am ---
[2026-06-25, 4:30:00 pm] [ORCHESTRATOR] Running main agent...
[2026-06-25, 4:30:01 pm] [AGENT] Trying: gemini-2.5-flash-lite
[2026-06-25, 4:30:01 pm] [TOOL CALL] get_schedule({"userId":"default"})
[2026-06-25, 4:30:02 pm] [TOOL RESULT] get_schedule → • [HIGH] Team Standup...
[2026-06-25, 4:30:02 pm] [TOOL CALL] schedule_task({...})
[2026-06-25, 4:30:03 pm] [AGENT] Success: gemini-2.5-flash-lite
[2026-06-25, 4:30:03 pm] [CRITIC] Fast-Pass — simple query, no audit needed.
```

---

## 16. Data Flow Diagrams

### Chat Message Flow

```
User types message
    │
    ▼
POST /chat { message, sessionId }
    │
    ▼
getHistory(sessionId)          ← chat_history.json
    │
    ▼
runCollaborativeChat(message, history)
    │
    ├── recallMemories()        ← Qdrant semantic search (4s timeout)
    │       └── Prepend to query if found
    │
    ├── runAgent(enrichedQuery, history)
    │       ├── tryModel("gemini-2.5-flash-lite")
    │       │       └── Tool loop (max 6 iterations)
    │       │               ├── search_the_web()
    │       │               ├── get_schedule()
    │       │               ├── schedule_task()
    │       │               └── save_user_memory()
    │       └── Returns final text
    │
    ├── needsAudit()? → runCritic() (5s timeout)
    │       ├── APPROVED → continue
    │       └── REDO → runAgent(fixPrompt) → re-run once
    │
    ├── extractFinalReply()
    │
    ├── saveMessage(sessionId, 'user', message)
    ├── saveMessage(sessionId, 'model', finalAnswer)
    │
    └── SSE: { type: 'final', answer: finalAnswer }

Browser receives SSE → marked.parse(answer) → inject into chat bubble
```

### Task Creation Flow

```
User fills modal → submitTask()
    │
    ├── POST /api/tasks/preview
    │       ├── getUserTasks()
    │       ├── Find conflict (< 90 min window)
    │       │       ├── No conflict → { conflict: false }
    │       │       └── Conflict → findNextClearSlot() → try AI (5s) → respond
    │       │
    │       └── Frontend: conflict? show modal : proceed to create
    │
    └── POST /api/tasks
            ├── getUserTasks() → build schedule context string
            ├── enrichTask(title, description, time, scheduleStr)
            │       └── runAgent(prompt) → BRIEFING + PRIORITY + TIME_IST
            ├── Parse: briefing, priority, finalTime
            ├── addTask(userId, title, briefing, finalTime, priority, frequency, 24, category)
            │       └── Append to tasks.json
            └── Return task object

Frontend: closeModal() → loadTasks() → re-render all task lists
```

### Proactive Notification Flow

```
[Every 60 seconds]
proactive_engine tick
    │
    ├── Read tasks.json
    │
    ├── Auto-archive: status=pending AND time > 30min ago
    │       └── status = "notified", write file
    │
    ├── Find due: status=pending AND -1min ≤ time ≤ +2min
    │       AND lastNotified is null or > 10min ago
    │
    ├── No due tasks → done
    │
    └── Due tasks found:
            ├── runAgentSimple(reminderPrompt)   ← ≤15 word reminder
            ├── broadcastNotification(payload)   ← SSE to all browsers
            ├── Update each due task:
            │       remaining > 1: remaining--, time += intervalHours
            │       remaining ≤ 1: status = "notified"
            └── Write tasks.json
```

---

*Documentation generated for Nexus AI v1.0 — June 2026*
