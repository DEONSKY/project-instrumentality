# KB-MCP Test Prompts — Example Projects

> Step-by-step prompts you send to an agent (Claude Code, Cursor, etc.) that has KB-MCP connected.
> Each section sets up a test project, scaffolds KB content, and exercises the full tool chain.
> Three stacks covered: **React + Vite**, **Go**, **Spring Boot**.

---

## Part A — React + Vite Project: "TaskFlow" (Task Management App)

### A.0 Project scaffolding (run in terminal — not MCP)

```bash
mkdir taskflow && cd taskflow && git init
npm init -y
npm install react react-dom react-router-dom @tanstack/react-query zod
npm install -D vite @vitejs/plugin-react typescript
mkdir -p src/{components,services,validators,models,hooks,api,router}

# Minimal indicator files for stack detection
cat > src/components/TaskForm.tsx << 'EOF'
import { z } from 'zod'
const taskSchema = z.object({
  title: z.string().min(1).max(200),
  assignee: z.string().email(),
  priority: z.enum(['low', 'medium', 'high', 'critical']),
  dueDate: z.string().datetime(),
})
export function TaskForm() { return <form>TODO</form> }
EOF

cat > src/services/taskService.ts << 'EOF'
export async function createTask(data: any) {
  return fetch('/api/tasks', { method: 'POST', body: JSON.stringify(data) })
}
export async function assignTask(taskId: string, userId: string) {
  return fetch(`/api/tasks/${taskId}/assign`, { method: 'PATCH', body: JSON.stringify({ userId }) })
}
EOF

cat > src/validators/taskValidator.ts << 'EOF'
export function validateDueDate(date: string): boolean {
  return new Date(date) > new Date()
}
export function validatePriority(p: string): boolean {
  return ['low', 'medium', 'high', 'critical'].includes(p)
}
EOF

cat > src/api/tasks.ts << 'EOF'
const API_BASE = '/api/v1'
export const taskEndpoints = {
  list: `${API_BASE}/tasks`,
  create: `${API_BASE}/tasks`,
  get: (id: string) => `${API_BASE}/tasks/${id}`,
  assign: (id: string) => `${API_BASE}/tasks/${id}/assign`,
  close: (id: string) => `${API_BASE}/tasks/${id}/close`,
}
EOF

cat > src/models/task.ts << 'EOF'
export interface Task {
  id: string
  title: string
  description?: string
  assignee: string
  priority: 'low' | 'medium' | 'high' | 'critical'
  status: 'open' | 'in_progress' | 'review' | 'done'
  dueDate: string
  createdAt: string
}
EOF

cat > src/router/guards.ts << 'EOF'
export function requireAuth(next: Function) {
  const token = localStorage.getItem('token')
  if (!token) window.location.href = '/login'
  else next()
}
EOF

git add -A && git commit -m "initial project setup"
```

### A.1 Bootstrap KB

> **Prompt to agent:**
> Initialize the knowledge base for this project.

**Expected:** Agent calls `kb_init`. Output shows `detected_stack: react-vite`. Folders, hooks, `_rules.md`, `.gitattributes` created.

### A.2 Scaffold foundation files

> **Prompt to agent:**
> Create foundation files for this project. The project name is "TaskFlow". We use React 18 + Vite + TypeScript + TanStack Query + Zod for validation. Conventions: all components are functional, API calls go through TanStack Query hooks, validation uses Zod schemas.

**Expected:** Agent calls `kb_scaffold` three times:
- `type: "global-rules"` → `foundation/global-rules.md`
- `type: "tech-stack"` → `foundation/tech-stack.md`
- `type: "conventions"` → `foundation/conventions.md`

### A.3 Scaffold a feature with description

> **Prompt to agent:**
> Create a KB entry for our task creation feature. Users fill in a form with title (required, 1-200 chars), description (optional, max 2000 chars), assignee (email, required), priority (low/medium/high/critical, default medium), and due date (must be in the future). Business rules: critical tasks auto-notify the assignee via email, tasks without a due date default to 7 days from now.

**Expected:** Agent calls `kb_scaffold({ type: "feature", id: "task-create", description: "..." })`, gets back a prompt, fills it, calls back with content. File created at `knowledge/features/task-create.md`.

### A.4 Scaffold a flow

> **Prompt to agent:**
> Create a KB flow for task assignment. Steps: 1) manager selects task, 2) manager picks assignee from team dropdown, 3) system validates assignee has capacity (max 10 active tasks), 4) system updates task and sends notification. Guard: task must be in "open" status. States: unassigned → assigned → accepted.

**Expected:** `knowledge/flows/task-assignment.md` created with steps, guards, and states filled.

### A.5 Query the KB

> **Prompt to agent:**
> What validation rules apply to the task title field?

**Expected:** Agent calls `kb_ask`. Intent: `query`. Returns answer citing `features/task-create.md ## Fields`.

### A.6 Challenge the KB

> **Prompt to agent:**
> What's missing in the task creation feature?

**Expected:** Agent calls `kb_ask`. Intent: `challenge`. May identify missing fields, edge cases, or contradictions.

### A.7 Trigger drift detection

```bash
# Simulate code change
echo "export function archiveTask(id: string) { /* TODO */ }" >> src/services/taskService.ts
git add -A && git commit -m "add archive task function"
```

> **Prompt to agent:**
> Run drift detection.

**Expected:** Agent calls `kb_drift({})`. Returns `code_entries: 1` — `src/services/taskService.ts` maps to `flows/task.md` or similar target.

### A.8 Resolve drift

> **Prompt to agent:**
> sync task

**Expected:** Agent calls `kb_ask({ question: "sync task" })`. Gets `ask-sync.md` prompt. Shows the diff, asks whether to update KB or revert code.

### A.9 Impact analysis

> **Prompt to agent:**
> We are changing the task priority from 4 levels to 5 (adding "urgent" above "critical"). What KB files need to change?

**Expected:** Agent calls `kb_impact`. Returns `features/task-create.md` and any flows referencing priority.

### A.10 Generate code from KB

> **Prompt to agent:**
> Generate the Zod validation schema for task creation based on the KB spec.

**Expected:** Agent calls `kb_ask({ question: "generate task-create validation schema" })`. Intent: `generate`. Returns prompt with KB context for code generation.

### A.11 Export KB

> **Prompt to agent:**
> Export the entire knowledge base as JSON.

**Expected:** Agent calls `kb_export({ format: "json" })`. File written to `knowledge/exports/`.

---

## Part B — Go Project: "OrderAPI" (E-commerce Order Service)

### B.0 Project scaffolding (run in terminal)

```bash
mkdir orderapi && cd orderapi && git init

cat > go.mod << 'EOF'
module github.com/acme/orderapi
go 1.22
require (
    github.com/gin-gonic/gin v1.9.1
    github.com/jmoiron/sqlx v1.3.5
    github.com/segmentio/kafka-go v0.4.47
)
EOF

mkdir -p internal/order/{handler,service,model,repository}
mkdir -p internal/auth/middleware
mkdir -p internal/payment/client
mkdir -p db/migrations
mkdir -p proto

cat > internal/order/handler/order_handler.go << 'EOF'
package handler

type OrderHandler struct{}

func (h *OrderHandler) CreateOrder(c *gin.Context) {
    // POST /api/v1/orders
    // Validate: items non-empty, total > 0, shipping address required
}

func (h *OrderHandler) GetOrder(c *gin.Context) {
    // GET /api/v1/orders/:id
}

func (h *OrderHandler) CancelOrder(c *gin.Context) {
    // POST /api/v1/orders/:id/cancel
    // Only if status is "pending" or "confirmed"
}
EOF

cat > internal/order/service/order_service.go << 'EOF'
package service

type OrderService struct{}

func (s *OrderService) PlaceOrder(items []Item, shippingAddr Address) (*Order, error) {
    // 1. Validate items in stock
    // 2. Calculate total with tax
    // 3. Reserve inventory
    // 4. Create order record
    // 5. Publish OrderCreated event
    return nil, nil
}

func (s *OrderService) CancelOrder(orderID string) error {
    // 1. Check status is cancellable
    // 2. Release inventory
    // 3. Refund if paid
    // 4. Publish OrderCancelled event
    return nil
}
EOF

cat > internal/order/model/order_model.go << 'EOF'
package model

type Order struct {
    ID            string
    UserID        string
    Items         []OrderItem
    Status        string // pending, confirmed, shipped, delivered, cancelled
    Total         int64  // cents
    ShippingAddr  Address
    CreatedAt     string
}

type OrderItem struct {
    ProductID string
    Quantity  int
    UnitPrice int64
}
EOF

cat > internal/order/repository/order_repository.go << 'EOF'
package repository

type OrderRepository struct{}

func (r *OrderRepository) Create(order *model.Order) error { return nil }
func (r *OrderRepository) FindByID(id string) (*model.Order, error) { return nil, nil }
func (r *OrderRepository) UpdateStatus(id string, status string) error { return nil }
EOF

cat > internal/auth/middleware/auth_middleware.go << 'EOF'
package middleware

func JWTAuth() gin.HandlerFunc {
    return func(c *gin.Context) {
        token := c.GetHeader("Authorization")
        if token == "" {
            c.AbortWithStatusJSON(401, gin.H{"error": "missing token"})
            return
        }
        c.Next()
    }
}
EOF

cat > internal/payment/client/stripe_client.go << 'EOF'
package client

type StripeClient struct {
    APIKey string
}

func (c *StripeClient) Charge(amount int64, currency string) (string, error) {
    return "", nil
}

func (c *StripeClient) Refund(chargeID string) error {
    return nil
}
EOF

git add -A && git commit -m "initial Go project setup"
```

### B.1 Bootstrap KB

> **Prompt to agent:**
> Initialize the knowledge base for this project.

**Expected:** `detected_stack: go`. Patterns include `internal/**/handler/**`, `internal/**/service/**`, `go.mod`, etc.

### B.2 Scaffold foundation

> **Prompt to agent:**
> Create foundation files. Project name: "OrderAPI". Stack: Go 1.22, Gin framework, sqlx for DB, Kafka for events. Conventions: standard Go project layout, handler→service→repository layers, all errors wrapped with fmt.Errorf, context passed through all layers.

### B.3 Scaffold order feature

> **Prompt to agent:**
> Create a KB entry for the order creation feature. Fields: user_id (required, UUID), items (array, min 1), shipping_address (required, embedded struct with street/city/zip/country), total (calculated server-side in cents). Business rules: orders over $500 require manager approval, inventory must be reserved before confirming, tax calculated per country.

**Expected:** `knowledge/features/order-create.md` with filled fields, business rules, edge cases.

### B.4 Scaffold order flow

> **Prompt to agent:**
> Create a flow for the order lifecycle. Steps: placed → confirmed → payment_pending → paid → shipped → delivered. Cancellation allowed from placed/confirmed/payment_pending. Guards: only order owner or admin can cancel.

**Expected:** `knowledge/flows/order-lifecycle.md`

### B.5 Scaffold integration

> **Prompt to agent:**
> Create a KB integration entry for our Stripe payment integration. We use Stripe's charge and refund APIs. Rate limit: 100 req/s. Webhook events: payment_intent.succeeded, charge.refunded. Error mapping: card_declined → show user "Payment declined", rate_limit → retry with exponential backoff.

**Expected:** `knowledge/integrations/stripe.md`

### B.6 Trigger drift (Go paths)

```bash
# Add a new method to the service
cat >> internal/order/service/order_service.go << 'EOF'

func (s *OrderService) RefundOrder(orderID string) error {
    // 1. Verify order is paid
    // 2. Call stripe refund
    // 3. Update status to refunded
    // 4. Publish OrderRefunded event
    return nil
}
EOF
git add -A && git commit -m "add refund order service"
```

> **Prompt to agent:**
> Run drift detection.

**Expected:** `code_entries: 1`. Maps `internal/order/service/order_service.go` → `flows/order.md` (strips `Service`, kebab-case).

### B.7 Query the KB

> **Prompt to agent:**
> What happens when an order over $500 is placed?

**Expected:** Answer cites `features/order-create.md ## Business rules`: requires manager approval.

### B.8 Impact analysis

> **Prompt to agent:**
> We're switching from Stripe to Adyen for payment processing. What KB files need updating?

**Expected:** Returns `integrations/stripe.md`, plus any flows referencing payment/refund.

---

## Part C — Spring Boot Project: "ClinicAPI" (Healthcare Appointment System)

### C.0 Project scaffolding (run in terminal)

```bash
mkdir clinicapi && cd clinicapi && git init

cat > pom.xml << 'EOF'
<project>
  <modelVersion>4.0.0</modelVersion>
  <groupId>com.clinic</groupId>
  <artifactId>clinic-api</artifactId>
  <version>1.0.0</version>
  <dependencies>
    <dependency>
      <groupId>org.springframework.boot</groupId>
      <artifactId>spring-boot-starter-web</artifactId>
    </dependency>
    <dependency>
      <groupId>org.springframework.boot</groupId>
      <artifactId>spring-boot-starter-data-jpa</artifactId>
    </dependency>
    <dependency>
      <groupId>org.springframework.boot</groupId>
      <artifactId>spring-boot-starter-security</artifactId>
    </dependency>
  </dependencies>
</project>
EOF

mkdir -p src/main/java/com/clinic/{controller,service,entity,repository,security,dto}
mkdir -p src/main/resources/db/migration

cat > src/main/java/com/clinic/controller/AppointmentController.java << 'EOF'
package com.clinic.controller;

@RestController
@RequestMapping("/api/v1/appointments")
public class AppointmentController {

    @PostMapping
    public ResponseEntity<AppointmentDto> create(@Valid @RequestBody CreateAppointmentRequest request) {
        // Create appointment: patient, doctor, datetime, reason
        return null;
    }

    @PatchMapping("/{id}/cancel")
    public ResponseEntity<Void> cancel(@PathVariable Long id) {
        // Cancel appointment — only if > 24h before scheduled time
        return null;
    }

    @GetMapping("/doctor/{doctorId}")
    public ResponseEntity<List<AppointmentDto>> listByDoctor(@PathVariable Long doctorId) {
        // List all appointments for a doctor
        return null;
    }
}
EOF

cat > src/main/java/com/clinic/service/AppointmentService.java << 'EOF'
package com.clinic.service;

@Service
public class AppointmentService {

    public Appointment bookAppointment(Long patientId, Long doctorId, LocalDateTime dateTime, String reason) {
        // 1. Check doctor availability
        // 2. Check no double-booking (same doctor, overlapping time)
        // 3. Create appointment record
        // 4. Send confirmation email to patient
        // 5. Block doctor's calendar slot
        return null;
    }

    public void cancelAppointment(Long appointmentId) {
        // 1. Check cancellation window (24h rule)
        // 2. Free doctor's calendar slot
        // 3. Notify patient and doctor
        return;
    }
}
EOF

cat > src/main/java/com/clinic/entity/AppointmentEntity.java << 'EOF'
package com.clinic.entity;

@Entity
@Table(name = "appointments")
public class AppointmentEntity {
    @Id @GeneratedValue
    private Long id;
    private Long patientId;
    private Long doctorId;
    private LocalDateTime scheduledAt;
    private String reason;
    private String status; // scheduled, completed, cancelled, no_show
    private LocalDateTime createdAt;
}
EOF

cat > src/main/java/com/clinic/repository/AppointmentRepository.java << 'EOF'
package com.clinic.repository;

@Repository
public interface AppointmentRepository extends JpaRepository<AppointmentEntity, Long> {
    List<AppointmentEntity> findByDoctorIdAndScheduledAtBetween(Long doctorId, LocalDateTime start, LocalDateTime end);
    List<AppointmentEntity> findByPatientIdAndStatus(Long patientId, String status);
}
EOF

cat > src/main/java/com/clinic/security/JwtAuthFilter.java << 'EOF'
package com.clinic.security;

@Component
public class JwtAuthFilter extends OncePerRequestFilter {
    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain) {
        String header = request.getHeader("Authorization");
        if (header == null || !header.startsWith("Bearer ")) {
            response.setStatus(401);
            return;
        }
        // validate JWT token
        chain.doFilter(request, response);
    }
}
EOF

cat > src/main/java/com/clinic/dto/CreateAppointmentRequest.java << 'EOF'
package com.clinic.dto;

public class CreateAppointmentRequest {
    @NotNull private Long patientId;
    @NotNull private Long doctorId;
    @NotNull @Future private LocalDateTime scheduledAt;
    @Size(max = 500) private String reason;
}
EOF

cat > src/main/resources/application.yml << 'EOF'
spring:
  datasource:
    url: jdbc:postgresql://localhost:5432/clinic
  jpa:
    hibernate:
      ddl-auto: validate
EOF

git add -A && git commit -m "initial Spring Boot project setup"
```

### C.1 Bootstrap KB

> **Prompt to agent:**
> Initialize the knowledge base for this project.

**Expected:** `detected_stack: spring-boot`. Patterns include `src/main/java/**/*Controller.java`, `pom.xml`, etc.

### C.2 Scaffold foundation

> **Prompt to agent:**
> Create foundation files. Project: "ClinicAPI". Stack: Spring Boot 3.2, Java 21, PostgreSQL, Spring Security with JWT. Conventions: DTOs for API layer, entities for persistence, services contain business logic, controller never accesses repository directly.

### C.3 Scaffold appointment feature

> **Prompt to agent:**
> Create a KB entry for appointment booking. Fields: patient_id (required, FK), doctor_id (required, FK), scheduled_at (required, must be future, must be during working hours 09:00-17:00), reason (optional, max 500 chars), status (enum: scheduled/completed/cancelled/no_show, default: scheduled). Business rules: no double-booking same doctor in same hour slot, cancellation only allowed 24h before scheduled_at, max 20 appointments per doctor per day.

**Expected:** `knowledge/features/appointment-booking.md` with detailed fields table and business rules.

### C.4 Scaffold validation rules

> **Prompt to agent:**
> Create validation rules. Rules: scheduled_at must be weekday 09:00-17:00, patient must have verified identity, doctor must be active and not on leave.

**Expected:** `knowledge/validation/common.md` or `validation/appointment.md`.

### C.5 Scaffold schema

> **Prompt to agent:**
> Create a data schema for the appointment entity. Fields: id (bigint, PK), patient_id (bigint, FK→patients), doctor_id (bigint, FK→doctors), scheduled_at (timestamp with timezone), reason (varchar 500), status (varchar 20), created_at (timestamp), updated_at (timestamp). Indexes: (doctor_id, scheduled_at) unique, (patient_id, status).

**Expected:** `knowledge/data/schema/appointment.md`

### C.6 Trigger drift (Spring paths)

```bash
# Add a new endpoint
cat >> src/main/java/com/clinic/controller/AppointmentController.java << 'EOF'

    @PatchMapping("/{id}/reschedule")
    public ResponseEntity<AppointmentDto> reschedule(@PathVariable Long id, @RequestBody RescheduleRequest request) {
        // Reschedule — same 24h cancellation window applies
        return null;
    }
EOF
git add -A && git commit -m "add reschedule endpoint"
```

> **Prompt to agent:**
> Run drift detection.

**Expected:** Maps `AppointmentController.java` → `features/appointment.api.md` (strips `Controller`, kebab-case).

### C.7 Resolve drift

> **Prompt to agent:**
> sync appointment

**Expected:** Agent shows the diff (reschedule endpoint added), asks whether to update KB.

### C.8 Brainstorm

> **Prompt to agent:**
> Should we implement appointment reminders as push notifications or email?

**Expected:** Intent: `brainstorm`. Agent uses KB context to reason about trade-offs.

### C.9 Onboard

> **Prompt to agent:**
> Walk me through the appointment booking flow.

**Expected:** Intent: `onboard`. Agent gives a structured tour citing flows and features.

### C.10 Import a document

Create a sample requirements doc:

```bash
cat > /tmp/clinic-requirements.md << 'EOF'
# Patient Registration

Patients must register before booking appointments. Required information:
- Full name
- Date of birth
- Email (unique, verified)
- Phone number
- Insurance provider and policy number

# Doctor Availability

Each doctor sets weekly availability. Default: Monday-Friday 09:00-17:00.
Doctors can block specific dates for holidays or conferences.
Maximum 20 appointments per day.

# Billing

After appointment completion, system generates an invoice.
Insurance patients: bill sent to insurance provider.
Self-pay patients: payment collected at checkout.
Cancellation fee: $25 if cancelled less than 24h before appointment.
EOF
```

> **Prompt to agent:**
> Import the requirements document at /tmp/clinic-requirements.md into the knowledge base.

**Expected:** Agent calls `kb_import`. Returns 3 chunks (Patient Registration, Doctor Availability, Billing). Agent classifies each, fills templates, writes files.

### C.11 Full cycle — consistency check

1. Create `knowledge/features/appointment-booking.md` with Description saying "max 15 appointments per day" but Business rules saying "max 20 appointments per doctor per day".
2. Trigger a KB drift entry for this file.
3. Ask agent to sync.

> **Prompt to agent:**
> sync appointment-booking

**Expected:** Step 4 of `ask-sync.md` catches the inconsistency: "Internal inconsistency found: ## Description says 15 but ## Business rules says 20."

---

## Part D — Cross-stack tests (run on any project)

### D.1 Migrate after rules change

```bash
# Edit _rules.md: change default_max from 3 to 2
git add -A && git commit -m "tighten depth policy"
```

> **Prompt to agent:**
> Run migration check after the rules change.

**Expected:** `kb_migrate` finds the diff. Returns prompts for each KB file that may need restructuring.

### D.2 Export and re-import round-trip

> **Prompt to agent:**
> Export the knowledge base as JSON, then verify the export contains all files.

**Expected:** JSON file contains every KB file with content.

### D.3 Scaffold all types

> **Prompt to agent:**
> Create one KB file of each type: feature, flow, schema, validation, integration, decision.

**Expected:** 6 files created, all pass lint, all appear in `_index.yaml`.

### D.4 Group auto-creation

> **Prompt to agent:**
> Create features for the billing domain: invoice-create, invoice-send, payment-receive. Group them under "billing".

**Expected:** `features/billing/_group.md` auto-created. Three feature files inside `features/billing/`.

### D.5 @mention wiring

> Create `features/checkout.md` with body containing `@features/billing/invoice-create`.

> **Prompt to agent:**
> Reindex the knowledge base.

**Expected:** `_index.yaml` entry for `checkout.md` has `features/billing/invoice-create` in `depends_on`.

### D.6 Multi-file impact cascade

> Create `features/auth.md`. Create `features/checkout.md` with `depends_on: [auth]`. Create `flows/payment.md` with `depends_on: [checkout]`.

> **Prompt to agent:**
> We're changing the auth token format from JWT to opaque tokens. What's the impact?

**Expected:** Impact returns all three files (auth → checkout → payment) via transitive dependency.

---

## Part E — Git Submodule Support

> **Important:** This test runs inside an **existing** test project that already has kb-mcp
> initialized (e.g. the TaskFlow project from Part A). The submodule source repos are created
> in a temporary directory — NOT inside or next to the test project.

### E.0 Add submodules to existing project (run in terminal — not MCP)

```bash
# Save your test project path (run from inside your test project root)
PROJECT_DIR=$(pwd)

# Create submodule source repos in a temp directory
TMPDIR=$(mktemp -d)

# Backend repo (owned submodule)
git init "$TMPDIR/backend-repo"
mkdir -p "$TMPDIR/backend-repo/src/controllers" "$TMPDIR/backend-repo/src/services"
cat > "$TMPDIR/backend-repo/src/controllers/UserController.ts" << 'EOF'
export class UserController { async getUser(id: string) {} }
EOF
cat > "$TMPDIR/backend-repo/src/services/UserService.ts" << 'EOF'
export class UserService { async findById(id: string) {} }
EOF
git -C "$TMPDIR/backend-repo" add -A && git -C "$TMPDIR/backend-repo" commit -m "init backend"

# Client SDK repo (shared submodule)
git init "$TMPDIR/client-sdk-repo"
mkdir -p "$TMPDIR/client-sdk-repo/src"
cat > "$TMPDIR/client-sdk-repo/src/auth-client.ts" << 'EOF'
export function authenticate(token: string) { return fetch('/auth/verify') }
EOF
git -C "$TMPDIR/client-sdk-repo" add -A && git -C "$TMPDIR/client-sdk-repo" commit -m "init client-sdk"

# Add submodules to test project (still in $PROJECT_DIR)
cd "$PROJECT_DIR"
git submodule add "$TMPDIR/backend-repo" backend
git submodule add "$TMPDIR/client-sdk-repo" client-sdk

# Mark client-sdk as shared (use the submodule path name, not the repo name)
git config --file .gitmodules submodule.client-sdk.kb-shared true
git add .gitmodules && git commit -m "add submodules"
```

### E.1 Re-initialize KB to pick up submodules

> **Prompt to agent:**
> Re-initialize the knowledge base. The project now has git submodules — a backend (owned) and a client-sdk (shared, marked with kb-shared = true).

**Expected:**
- `kb_init` detects submodules (backend, client-sdk)
- Setup guide mentions that `backend/` and `client-sdk/` need prefixed code_path_patterns in `_rules.md`
- Pre-push hook updated with submodule branch guard
- kb-feature.sh script marked executable

### E.2 Add submodule-prefixed patterns

> **Prompt to agent:**
> Add code path patterns for the backend submodule. Backend has controllers in `backend/src/controllers/` and services in `backend/src/services/`. Also add a pattern for `client-sdk/src/**`.

**Expected:** `_rules.md` updated with patterns like `backend/src/controllers/**`, `backend/src/services/**`, `client-sdk/src/**`.

### E.3 Scaffold KB files and test drift detection

> **Prompt to agent:**
> Scaffold a feature KB file called `user-management` that covers user CRUD operations.

**Expected:** `features/user-management.md` created.

Now trigger drift manually:

```bash
# Make a change in the backend submodule
cd backend
echo 'export function deleteUser(id: string) {}' >> src/services/UserService.ts
git add -A && git commit -m "add deleteUser"
cd ..
git add backend && git commit -m "update backend pointer"
```

> **Prompt to agent:**
> Run drift detection to see if any code changes need KB updates.

**Expected:** Drift entry created for `features/user-management.md` with code file `backend/src/services/UserService.ts`.

### E.4 Test shared submodule drift tagging

```bash
# Make a change in the shared client-sdk
cd client-sdk
echo 'export function refreshToken(token: string) {}' >> src/auth-client.ts
git add -A && git commit -m "add refreshToken"
cd ..
git add client-sdk && git commit -m "update client-sdk pointer"
```

> **Prompt to agent:**
> Run drift detection.

**Expected:** Drift entry includes `- **Shared module:** true` line, signaling PM that this change may affect other projects.

### E.5 Test kb-feature status

```bash
./knowledge/_mcp/scripts/kb-feature.sh status
```

**Expected:** Output shows:
- Parent branch
- `backend` with `[owned]` label
- `client-sdk` with `[shared]` label
- Pointer-changed status for each

### E.6 Test branch guard (owned submodule mismatch)

```bash
git checkout -b feature/auth
cd backend
git checkout main   # backend stays on main — deliberate mismatch
cd ..
# backend pointer already changed from E.3, so it's staged
git push origin feature/auth
```

**Expected:** Push blocked with `[kb] ERROR: Submodule branch mismatch`. Error shows backend is on 'main', expected 'feature/auth'. Provides two fix options.

### E.7 Fix mismatch and push with kb-feature

```bash
cd backend && git checkout -b feature/auth && cd ..
git add backend && git commit -m "fix backend branch"
./knowledge/_mcp/scripts/kb-feature.sh push
```

**Expected:** kb-feature pushes backend first with `-u origin feature/auth`, then pushes parent. No errors.

### E.8 Test shared submodule warning (non-blocking)

```bash
# client-sdk is on main, parent is on feature/auth — but client-sdk is shared
cd client-sdk
echo 'export function logout() {}' >> src/auth-client.ts
git add -A && git commit -m "add logout"
cd ..
git add client-sdk && git commit -m "update client-sdk"
./knowledge/_mcp/scripts/kb-feature.sh push
```

**Expected:** Warning printed about shared submodule pointer update, but push proceeds. client-sdk pushed to its own branch (main), not feature/auth.
