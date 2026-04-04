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

### A.2 Scaffold standards files

> **Prompt to agent:**
> Create the standards files for this project. The project name is "TaskFlow". We use React 18 + Vite + TypeScript + TanStack Query + Zod for validation. Conventions: all components are functional, API calls go through TanStack Query hooks, validation uses Zod schemas.

**Expected:** Agent calls `kb_scaffold` at minimum:
- `type: "global-rules"` → `standards/global.md` (always_load: true)
- `type: "tech-stack"` → `standards/code/tech-stack.md`
- `type: "conventions"` → `standards/code/conventions.md`

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

### B.2 Scaffold standards files

> **Prompt to agent:**
> Create the standards files. Project name: "OrderAPI". Stack: Go 1.22, Gin framework, sqlx for DB, Kafka for events. Conventions: standard Go project layout, handler→service→repository layers, all errors wrapped with fmt.Errorf, context passed through all layers.

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

### B.8 Analyze Go codebase coverage

> **Prompt to agent:**
> Analyze the codebase and show me KB coverage for all source files.

**Expected:** `kb_analyze({})` returns inventory. Go files in `internal/` grouped by KB target using Go presets. Shows which groups need KB files and which already have them.

### B.9 Impact analysis

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

### C.2 Scaffold standards files

> **Prompt to agent:**
> Create the standards files. Project: "ClinicAPI". Stack: Spring Boot 3.2, Java 21, PostgreSQL, Spring Security with JWT. Conventions: DTOs for API layer, entities for persistence, services contain business logic, controller never accesses repository directly.

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

### C.10 Analyze Spring Boot codebase

> **Prompt to agent:**
> Analyze the project source code and generate a KB coverage report.

**Expected:** `kb_analyze({})` groups Spring Boot files (controllers, services, entities, repositories) by KB target. Controller files map to `features/*.api.md`, service files to `flows/*.md`, etc.

### C.11 Import a document

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

### C.12 Full cycle — consistency check

1. Create `knowledge/features/appointment-booking.md` with Description saying "max 15 appointments per day" but Business rules saying "max 20 appointments per doctor per day".
2. Trigger a KB drift entry for this file.
3. Ask agent to sync.

> **Prompt to agent:**
> sync appointment-booking

**Expected:** Step 4 of `ask-sync.md` catches the inconsistency: "Internal inconsistency found: ## Description says 15 but ## Business rules says 20."

### A.12 Analyze codebase coverage

> **Prompt to agent:**
> Analyze the codebase and show me which source files have KB coverage and which don't.

**Expected:** Agent calls `kb_analyze({})`. Returns inventory grouping `src/` files by KB target. Groups with existing KB files show `suggested_action: "review"`, uncovered groups show `"create"`.

### A.13 Create draft KB files from analysis

> **Prompt to agent:**
> Create draft KB files for all uncovered code groups.

**Expected:** Agent calls `kb_analyze({ write_drafts: true })`. Draft files created with `confidence: draft` tag. Each lists source files and has placeholder sections.

### A.14 Scaffold a process standard

> **Prompt to agent:**
> Create a standard that teaches agents how to perform task prioritization. When a user asks to prioritize tasks, the agent should consider due date, priority level, assignee workload, and dependencies between tasks.

**Expected:** Agent calls `kb_scaffold({ type: "standard", id: "task-prioritization", group: "process", description: "..." })`, fills the template, writes to `knowledge/standards/process/task-prioritization.md`.

### A.15 Test overlap detection

> **Prompt to agent:**
> Create a KB entry for user authentication with email/password login and JWT tokens.

(Run this AFTER A.3 has created `features/task-create.md` and assuming a `features/user-auth.md` or similar auth file exists.)

**Expected:** If an overlapping auth file exists, the scaffold fill prompt warns: "We already have [file] that covers [topic]. Should I extend that instead of creating a new file?" Agent should surface this warning before proceeding.

### A.16 Load context with task_context

> **Prompt to agent:**
> I'm about to create a new task search feature. Load the relevant KB context for creating this feature.

**Expected:** Agent calls `kb_get({ keywords: ["task", "search"], task_context: "creating" })`. Feature-type files get a relevance boost. Foundation files with `always_load: true` are included.

### A.17 Load context for reviewing

> **Prompt to agent:**
> I need to review recent code changes. Load KB context for reviewing.

**Expected:** Agent calls `kb_get({ keywords: ["task"], task_context: "reviewing" })`. Validation and flow files get a relevance boost. If drift entries exist in `sync/code-drift.md`, those KB targets are also loaded.

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

**Expected:** `features/billing/billing.md` (folder note) auto-created — NOT `_group.md`. Three feature files inside `features/billing/`. The folder note has `type: group` in front-matter.

### D.5 Wikilink wiring

> Create `features/checkout.md` with body containing `[[features/billing/invoice-create]]`.

> **Prompt to agent:**
> Reindex the knowledge base.

**Expected:** `_index.yaml` entry for `checkout.md` has `features/billing/invoice-create` in `depends_on`.

### D.6 Analyze and bootstrap KB on existing project

> **Prompt to agent:**
> This is a legacy project with no KB files. Analyze the codebase to see what needs documenting.

**Expected:** `kb_analyze({})` returns inventory. Follow up with:

> **Prompt to agent:**
> Create draft KB files for all the uncovered groups, then list what was created.

**Expected:** `kb_analyze({ write_drafts: true })` writes drafts. Agent lists all created files.

### D.7 Scaffold all types including standard

> **Prompt to agent:**
> Create one KB file of each type: feature, flow, schema, validation, integration, decision, standard.

**Expected:** 7 files created (including `standards/process/test.md`), all pass lint, all appear in `_index.yaml`.

### D.8 Standard loaded via kb_get

> Create `knowledge/standards/process/deploy-guide.md` with content.

> **Prompt to agent:**
> Load KB context related to deployment.

**Expected:** Agent calls `kb_get({ keywords: ["deploy"] })`. `standards/process/deploy-guide.md` appears in results.

### D.9 Multi-file impact cascade

> Create `features/auth.md`. Create `features/checkout.md` with `depends_on: [auth]`. Create `flows/payment.md` with `depends_on: [checkout]`.

> **Prompt to agent:**
> We're changing the auth token format from JWT to opaque tokens. What's the impact?

**Expected:** Impact returns all three files (auth → checkout → payment) via transitive dependency.

### D.10 Obsidian vault fields — scaffold and verify

> **Prompt to agent:**
> Scaffold a new feature called "order-tracking". Then open the created file and verify it has `type`, `aliases`, and `cssclasses` fields in its front-matter.

**Expected:**
1. Agent calls `kb_scaffold({ type: "feature", id: "order-tracking", description: "..." })`, fills, writes.
2. `knowledge/features/order-tracking.md` front-matter contains:
   - `type: feature`
   - `aliases: [order-tracking]`
   - `cssclasses: [kb-feature]`
3. Body contains `> [!warning] Edge cases` and `> [!question] Open questions` callouts (not plain headings).

**TC:** TC-2.11, TC-2.12

### D.11 Type keyword search in kb_get

> Create `flows/checkout-flow.md` (with `type: flow` in front-matter) and `features/checkout.md` (with `type: feature`). Run `kb_reindex`. Then:

> **Prompt to agent:**
> Load KB context using the keyword "flow".

**Expected:** Agent calls `kb_get({ keywords: ["flow"] })`. `flows/checkout-flow.md` appears in results (matched on `type: flow` in search text). `features/checkout.md` does not match on type alone.

**TC:** TC-4.15

### D.12 Type inferred from folder path (no explicit type field)

> Create `integrations/stripe.md` without a `type` field in front-matter. Run `kb_reindex`.

> **Prompt to agent:**
> Run `kb_reindex` and check the `_index.yaml` entry for `integrations/stripe.md`.

**Expected:** `_index.yaml` entry has `type: integration` — inferred by `inferType()` from the `integrations/` folder path.

**TC:** TC-8.8

### D.13 Folder note group creation

> **Prompt to agent:**
> Create features for the payments domain: charge-create, refund-issue. Group them under "payments".

**Expected:**
1. `features/payments/charge-create.md` and `features/payments/refund-issue.md` created.
2. `features/payments/payments.md` auto-created as folder note (NOT `features/payments/_group.md`).
3. `payments.md` has `type: group` in front-matter.

**TC:** TC-2.4, TC-2.4b

---

## Part E — Git Submodule Support

> **Important:** This test requires a **self-contained** environment with bare remotes
> so `git push` works. You can run this on an existing test project (e.g. TaskFlow from
> Part A) or create a fresh one. The setup script below creates everything from scratch.

### E.0 Submodule test infrastructure (run in terminal — not MCP)

```bash
#!/bin/bash
# Creates a complete submodule test environment with bare remotes.
# Run from any directory — everything is created under a temp root.
set -e

TEST_ROOT=$(mktemp -d)
echo "=== Submodule test root: $TEST_ROOT ==="

# ── 1. Create bare remote repos (simulate GitHub/GitLab) ─────────────────────
git init --bare "$TEST_ROOT/remotes/backend.git"
git init --bare "$TEST_ROOT/remotes/client-sdk.git"
git init --bare "$TEST_ROOT/remotes/parent.git"

# ── 2. Create backend source repo (owned submodule) ──────────────────────────
git init "$TEST_ROOT/src/backend"
mkdir -p "$TEST_ROOT/src/backend/src/controllers" "$TEST_ROOT/src/backend/src/services"

cat > "$TEST_ROOT/src/backend/src/controllers/UserController.ts" << 'CTRLEOF'
export class UserController {
  async getUser(id: string) { return { id, name: 'test' } }
  async listUsers() { return [] }
}
CTRLEOF

cat > "$TEST_ROOT/src/backend/src/services/UserService.ts" << 'SVCEOF'
export class UserService {
  async findById(id: string) { return null }
  async create(data: any) { return { id: '1', ...data } }
}
SVCEOF

git -C "$TEST_ROOT/src/backend" add -A
git -C "$TEST_ROOT/src/backend" commit -m "init backend"
git -C "$TEST_ROOT/src/backend" remote add origin "$TEST_ROOT/remotes/backend.git"
git -C "$TEST_ROOT/src/backend" push -u origin main 2>/dev/null || \
git -C "$TEST_ROOT/src/backend" push -u origin master

# ── 3. Create client-sdk source repo (shared submodule) ──────────────────────
git init "$TEST_ROOT/src/client-sdk"
mkdir -p "$TEST_ROOT/src/client-sdk/src"

cat > "$TEST_ROOT/src/client-sdk/src/auth-client.ts" << 'AUTHEOF'
export function authenticate(token: string) { return fetch('/auth/verify') }
export function getSession() { return fetch('/auth/session') }
AUTHEOF

git -C "$TEST_ROOT/src/client-sdk" add -A
git -C "$TEST_ROOT/src/client-sdk" commit -m "init client-sdk"
git -C "$TEST_ROOT/src/client-sdk" remote add origin "$TEST_ROOT/remotes/client-sdk.git"
git -C "$TEST_ROOT/src/client-sdk" push -u origin main 2>/dev/null || \
git -C "$TEST_ROOT/src/client-sdk" push -u origin master

# ── 4. Create parent project with submodules ──────────────────────────────────
git init "$TEST_ROOT/project"
cd "$TEST_ROOT/project"

# Minimal project files for stack detection (React Vite)
cat > package.json << 'PKGEOF'
{ "name": "submodule-test", "dependencies": { "react": "^18.0.0" } }
PKGEOF
mkdir -p src/components
cat > src/components/TaskForm.tsx << 'FORMEOF'
export function TaskForm() { return <form>TODO</form> }
FORMEOF

git add -A && git commit -m "init parent project"
git remote add origin "$TEST_ROOT/remotes/parent.git"

# Add submodules using bare remotes as URL (portable, no SSH/HTTPS needed)
git submodule add "$TEST_ROOT/remotes/backend.git" backend
git submodule add "$TEST_ROOT/remotes/client-sdk.git" client-sdk

# Mark client-sdk as shared
git config --file .gitmodules submodule.client-sdk.kb-shared true
git add .gitmodules
git commit -m "add submodules: backend (owned), client-sdk (shared)"

# Push parent to its bare remote so upstream tracking works
git push -u origin main 2>/dev/null || git push -u origin master

# ── 5. Configure MCP client ──────────────────────────────────────────────────
# Point your MCP client at the project-instrumentality server.
# Server cwd must be $TEST_ROOT/project (the test project).
# Example: { "mcpServers": { "kb": { "command": "node", "args": ["/path/to/project-instrumentality/knowledge/_mcp/server.js"] } } }

echo ""
echo "=== Setup complete ==="
echo "  Project dir:  $TEST_ROOT/project"
echo "  Bare remotes: $TEST_ROOT/remotes/{parent,backend,client-sdk}.git"
echo ""
echo "Next steps:"
echo "  1. cd $TEST_ROOT/project"
echo "  2. Configure MCP client to point at project-instrumentality server"
echo "  3. Run kb_init({ interactive: false }) via MCP"
echo "  4. Add submodule code_path_patterns to _rules.md"
echo "  5. Run tests E.1 through E.8"
```

> **Verify setup:** From `$TEST_ROOT/project`, run `git push` — should succeed (bare remote).
> Run `git -C backend push` — should also succeed. Both submodules should have `origin` configured.

### E.1 Re-initialize KB to pick up submodules

> **Prompt to agent:**
> Re-initialize the knowledge base. The project now has git submodules — a backend (owned) and a client-sdk (shared, marked with kb-shared = true).

**Expected:**
- `kb_init` detects submodules (backend, client-sdk)
- Setup guide mentions that `backend/` and `client-sdk/` need prefixed code_path_patterns in `_rules.md`
- Pre-push hook updated with submodule branch guard
- `kb_sub` tool available for submodule push coordination

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

### E.5 Test kb_sub status

```
kb_sub({ command: "status" })
```

**Expected:** Returns JSON with:
- `parent.branch` — current branch name
- `submodules[]` array with `backend` (type: "owned") and `client-sdk` (type: "shared")
- Each entry has `branch`, `pointer_changed`, `type`

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

### E.7 Fix mismatch and push with kb_sub

```bash
cd backend && git checkout -b feature/auth && cd ..
git add backend && git commit -m "fix backend branch"
```

```
kb_sub({ command: "push" })
```

**Expected:** `all_success: true`. Results show backend pushed first (order 1, type "owned"), then parent (order 2). No errors.

### E.8 Test shared submodule warning (non-blocking)

```bash
# client-sdk is on main, parent is on feature/auth — but client-sdk is shared
cd client-sdk
echo 'export function logout() {}' >> src/auth-client.ts
git add -A && git commit -m "add logout"
cd ..
git add client-sdk && git commit -m "update client-sdk"
```

```
kb_sub({ command: "push" })
```

**Expected:** `all_success: true`. Results show client-sdk pushed to its own branch (main), not feature/auth. Type is "shared".

---

## Part F — Coverage Gap Scenarios (run on any project with KB initialized)

### F.0 Setup — multi-section test document

```bash
cat > /tmp/multi-section-doc.md << 'EOF'
# User Management

Users can register with email and password. Registration requires email verification.
Password policy: minimum 8 characters, one uppercase letter, one number.
Users can update their profile including display name, avatar, and notification preferences.

# API Rate Limiting

All API endpoints are rate-limited to 100 requests per minute per authenticated user.
Unauthenticated endpoints are limited to 20 requests per minute per IP.
Exceeding the limit returns HTTP 429 with a Retry-After header.
Batch endpoints have a separate limit of 20 requests per minute.

# Data Retention

User data is retained for 7 years after account deletion per regulatory requirements.
Anonymization of PII occurs 90 days after deletion request. Audit logs are immutable
and retained indefinitely. Backup snapshots are purged on the same 90-day schedule.
EOF
```

### F.1 Import auto-classify flow

> **Prompt to agent:**
> Import the document at /tmp/multi-section-doc.md using auto-classify mode.

**Expected:** Agent calls `kb_import({ source: "/tmp/multi-section-doc.md", auto_classify: true })`. Returns 3 chunks in first batch. Agent classifies each (feature, integration/validation, validation/decision). Agent approves and files are written.

### F.2 Export with type filter

> **Prompt to agent:**
> Export only the flow-type KB files as JSON.

**Expected:** Agent calls `kb_export({ scope: "all", format: "json", type: "flow" })`. Only flow files appear in the export. File written to `knowledge/exports/`.

### F.3 Section-replace prompt override

```bash
cat > knowledge/_prompt-overrides/ask-query.md << 'EOF'
---
base: ask-query
override: section-replace
section: "## Instructions"
---
Always respond in bullet points. Never use paragraphs. Keep each bullet under 20 words.
EOF
```

> **Prompt to agent:**
> What validation rules apply to the task title field?

**Expected:** `kb_ask` uses section-replace override. The `## Instructions` section in the prompt is replaced with the custom bullet-point instructions. Other prompt sections are preserved.

---

## Part G — `kb_extract` — Standards from Code and KB (run on TaskFlow or any project with source files)

### G.1 Extract code standards (Phase 1)

> **Prompt to agent:**
> Derive a components coding standard from this project's source files. Use `kb_extract` with `source: "code"`, `target_id: "components"`, `target_group: "code"`.

**Expected:**
1. Agent calls `kb_extract({ source: "code", target_id: "components", target_group: "code" })`.
2. Tool returns `{ file_path, prompt, sample_files, sample_count, _instruction }`.
3. `sample_files` is non-empty. Files are from the project's source directories (not `node_modules`, `dist`, etc.).
4. `prompt` contains the sampled file contents and the `standard.md` template structure.
5. No file written yet.

**TC:** TC-23.1, TC-23.2

---

### G.2 Extract code standards (Phase 2 — write)

> **Prompt to agent (after G.1):**
> Fill the template from the prompt you received. Capture the actual patterns you see in the sampled files. Then write the standard using `kb_extract` Phase 2.

**Expected:**
1. Agent fills the template based on observed code patterns.
2. Calls `kb_extract({ source: "code", target_id: "components", target_group: "code", content: "<filled>" })`.
3. File written to `knowledge/standards/code/components.md`.
4. Front-matter has `id: components`, `type: standard`, `scope: code`, `app_scope: all`.

**TC:** TC-23.4

---

### G.3 Extract with paths filter

> **Prompt to agent:**
> Extract a forms standard but only sample files in `src/components/` — use the `paths` parameter to narrow the scope.

**Expected:**
1. Agent calls `kb_extract({ source: "code", target_id: "forms", target_group: "code", paths: ["src/components/**"] })`.
2. `sample_files` only contains paths matching `src/components/**`.
3. No files from `src/services/`, `src/hooks/`, etc.

**TC:** TC-23.3

---

### G.4 Extract knowledge standards from KB docs

> **Prompt to agent:**
> Extract a feature-writing standard from the existing feature KB files. Use `kb_extract` with `source: "knowledge"`, `paths: "features"`, `target_id: "feature-writing"`, `target_group: "knowledge"`.

**Expected:**
1. Agent calls `kb_extract({ source: "knowledge", target_id: "feature-writing", target_group: "knowledge", paths: "features" })`.
2. `sample_files` contains files from `features/` folder.
3. `prompt` includes the KB document content for the agent to analyse.
4. Agent fills the template and calls Phase 2.
5. File written to `knowledge/standards/knowledge/feature-writing.md`.

**TC:** TC-23.5

---

### G.5 Multi-stack standards with app_scope

> **Prompt to agent (on a monorepo with Go backend + React frontend):**
> Scaffold two coding standards — one for Go backend patterns (app_scope: backend) and one for TypeScript frontend patterns (app_scope: frontend). Then verify that kb_get with app_scope filtering works correctly.

**Expected:**
1. Agent calls `kb_scaffold({ type: "standard", id: "go-conventions", group: "code", app_scope: "backend" })`.
2. Agent calls `kb_scaffold({ type: "standard", id: "ts-conventions", group: "code", app_scope: "frontend" })`.
3. `go-conventions.md` has `app_scope: backend`; `ts-conventions.md` has `app_scope: frontend`.
4. `kb_get({ keywords: ["conventions"], app_scope: "frontend" })` returns only `ts-conventions.md`.
5. `kb_get({ keywords: ["conventions"], app_scope: "backend" })` returns only `go-conventions.md`.

**TC:** TC-2.7b, TC-23.9

---

### G.6 Auto-scaffold on init

> **Prompt to agent:**
> Run `kb_init` on this React project with `interactive: false`. Verify that the standard stub files were auto-created.

**Expected:**
1. Agent calls `kb_init({ interactive: false })`.
2. Result includes `scaffolded_standards: ["standards/global.md", "standards/code/tech-stack.md", "standards/code/conventions.md"]`.
3. All three files exist with template placeholder content.
4. Re-running `kb_init` does NOT re-scaffold (files already exist).

**TC:** TC-1.9, TC-1.10

---

### H.1 Pre-filing consultation (kb_issue_consult)

> **Prompt to agent:**
> I want to file a bug: "Login fails with expired token — users get a 500 error instead of a redirect to the login page when their JWT expires." Before filing, check the knowledge base for context.

**Expected:**
1. Agent calls `kb_issue_consult({ title: "Login fails with expired token", body: "users get a 500 error instead of a redirect to the login page when their JWT expires" })`.
2. Agent receives related KB docs and prompt.
3. Agent responds with: whether this is already known, affected components, suggested labels/priority, and an enriched issue description.

**TC:** TC-24.1

---

### H.2 Issue triage — full flow (kb_issue_triage)

> **Prompt to agent:**
> Triage this Jira bug: PROJ-456 "Cart total doesn't update when coupon is removed". Priority: high. Labels: cart, promotions. The user reports that removing a coupon doesn't recalculate the total.

**Expected:**
1. Agent calls `kb_issue_triage({ title: "Cart total doesn't update when coupon is removed", body: "removing a coupon doesn't recalculate the total", issue_id: "PROJ-456", source: "jira", labels: ["cart", "promotions"], priority: "high" })`.
2. Agent receives Phase 1 response with related docs and triage prompt.
3. Agent fills the triage report with frontmatter (issue_id, source, related_kb) and sections (Summary, Classification, Affected Components, Root Cause Hypothesis, Suggested KB Updates).
4. Agent calls `kb_issue_triage` again with `content` set to the filled report.
5. File written to `knowledge/sync/inbound/PROJ-456.md`.

**TC:** TC-25.1, TC-25.2

---

### H.3 Work item planning (kb_issue_plan)

> **Prompt to agent:**
> Break down all cart-related features into Jira stories for project CART.

**Expected:**
1. Agent calls `kb_issue_plan({ keywords: ["cart"], target: "jira", project_key: "CART" })`.
2. Agent receives Phase 1 response with source KB docs and planning prompt.
3. Agent generates YAML task breakdown with stories, acceptance criteria, labels, and dependencies.
4. Agent calls `kb_issue_plan` again with `content` set to the generated YAML.
5. File written to `knowledge/sync/outbound/YYYY-MM-DD-plan.yaml`.

**TC:** TC-26.1, TC-26.2, TC-26.3

---

### H.4 Plan from scope (kb_issue_plan export mode)

> **Prompt to agent:**
> Generate work items for all features in the knowledge base. Target: GitHub Issues.

**Expected:**
1. Agent calls `kb_issue_plan({ scope: "all", type: "feature", target: "github" })`.
2. Agent receives all feature docs as source_docs.
3. Agent generates task breakdown and writes to sync/outbound/.

**TC:** TC-26.4

---

## Part I — Git Submodule Support (TC-20.1–20.12)

> **Important:** These tests require a **multi-repo environment** with bare remotes.
> They CANNOT be run from the standard MCP test project. Use the TC-20.0 setup script
> or the E.0 script (identical) to create the environment first.
>
> **Relationship to Part E:** Part E (E.1–E.8) is the guided version of these tests,
> written as agent prompts. Part I below maps TC-20 test cases to specific commands
> so you can execute them directly and record pass/fail in TEST_RESULTS.md.

### I.0 Setup (same as TC-20.0 / E.0)

```bash
# Set PI_ROOT to your project-instrumentality checkout
export PI_ROOT=/path/to/project-instrumentality

# Run the setup script from TEST_CASES.md TC-20.0
# Or copy-paste from TEST_PROMPTS.md E.0
# Both create: $TEST_ROOT/project with 2 submodules + bare remotes

# After setup completes:
cd $TEST_ROOT/project

# Point your MCP client at this directory, then:
kb_init({ interactive: false })
```

**TC:** TC-20.0

### I.1 Pre-push guard tests (TC-20.1–20.4)

After `kb_init` installs hooks, test the pre-push guard:

```bash
# TC-20.1: Branch mismatch — push should be BLOCKED
git checkout -b feature/auth
git -C backend checkout main        # owned submodule stays on main
echo "// change" >> backend/src/services/UserService.ts
git -C backend add -A && git -C backend commit -m "backend change"
git add backend && git commit -m "update backend pointer"
git push origin feature/auth
# Expected: Push BLOCKED with "[kb] ERROR: Submodule branch mismatch"

# TC-20.2: No pointer change — push should PASS
git checkout -b feature/clean-test
# Don't touch submodule pointer
echo "// parent only" >> src/components/TaskForm.tsx
git add src/ && git commit -m "parent-only change"
git push origin feature/clean-test
# Expected: Push succeeds — submodule not involved

# TC-20.3: Shared submodule pointer change — WARNING only, not blocked
git checkout main 2>/dev/null || git checkout master
git -C client-sdk checkout main
echo "// sdk change" >> client-sdk/src/auth-client.ts
git -C client-sdk add -A && git -C client-sdk commit -m "sdk update"
git add client-sdk && git commit -m "update client-sdk pointer"
git push
# Expected: Warning "[kb] WARNING: Shared submodule pointer(s) updated" — push proceeds

# TC-20.4: No .gitmodules — backward compatibility
# (test on a separate project without submodules)
```

### I.2 Drift with submodules (TC-20.5–20.8)

> **Prompt to agent (TC-20.5):**
> Add code path patterns for the backend submodule: backend/src/controllers/** maps to features, backend/src/services/** maps to flows. Then create a feature file "user-management" and run drift detection.

```bash
# Make 3 commits in backend submodule on feature/auth
cd backend && git checkout -b feature/auth
echo "export function a() {}" >> src/services/UserService.ts
git add -A && git commit -m "change 1"
echo "export function b() {}" >> src/services/UserService.ts
git add -A && git commit -m "change 2"
echo "export function c() {}" >> src/services/UserService.ts
git add -A && git commit -m "change 3"
git push -u origin feature/auth
cd ..
git add backend && git commit -m "update backend pointer"
```

> **Prompt to agent:**
> Run drift detection.

**Expected (TC-20.5):** Drift reports all 3 commits worth of files. Result includes `submodules_owned` and `submodules_shared` arrays.

> **Prompt to agent (TC-20.6):**
> Make a change in the shared client-sdk submodule and run drift detection.

```bash
cd client-sdk
echo "export function newFunc() {}" >> src/auth-client.ts
git add -A && git commit -m "add newFunc"
cd ..
git add client-sdk && git commit -m "update client-sdk"
```

**Expected (TC-20.6):** Drift entry includes `- **Shared module:** true`.

**TC-20.7:** Run drift again (no new changes). The `Shared module: true` line should survive the round-trip.

**TC-20.8:** Change files in BOTH `src/` (parent) and `backend/src/` (submodule), push, run drift. Both sources should produce entries.

### I.3 detectSubmodules — verify via drift (TC-20.9)

`detectSubmodules()` is an internal function inside `drift.js` — not directly callable. Test indirectly:

> **Prompt to agent:**
> Run drift detection on this project.

```
kb_drift({})
```

**Expected:** Result includes `submodules_owned: ["backend"]` and `submodules_shared: ["client-sdk"]`, confirming `kb-shared = true` attribute in `.gitmodules` is parsed correctly.

### I.4 kb_sub tool (TC-20.10–20.11)

```
# TC-20.11: Status
kb_sub({ command: "status" })
# Expected: JSON with parent.branch, submodules[] with name/path/branch/type/pointer_changed

# TC-20.10: Push (fix mismatch first)
```

```bash
cd backend && git checkout -b feature/auth && cd ..
git add backend && git commit -m "fix backend branch"
```

```
kb_sub({ command: "push" })
# Expected: all_success: true, submodule pushed first, then parent
```

### I.5 kb_sub dry_run and merge_plan (TC-20.13–20.14)

```
# TC-20.13: Dry run push
kb_sub({ command: "push", dry_run: true })
# Expected: dry_run: true, push_plan array (submodules first, parent last), no actual push

# TC-20.14: Merge plan
kb_sub({ command: "merge_plan", target_branch: "main" })
# Expected: Ordered steps — merge owned submodules first, push, submodule_update, merge parent, push parent
```

### I.6 Init submodule pattern suggestion (TC-20.12)

```bash
# Remove backend/ patterns from _rules.md, then re-init
kb_init({ interactive: false })
```

**Expected:** Setup guide suggests adding `backend/` prefixed patterns. Does NOT auto-modify `_rules.md`.


---

## Part J — kb_autotag, kb_autorelate, and Agent Rules (run on any initialized project with KB content)

### J.0 Prerequisites

Use an existing initialized project that has KB files with empty `tags: []` — e.g. a project initialized with `kb_init` where features were scaffolded but not manually tagged. The `kb-test-project4` fixture works well.

---

### J.1 Auto-tag the entire KB (TC-28.1, TC-28.4, TC-28.6)

```
"Auto-tag all KB files so kb_ask can find them"
→ kb_autotag()
```

**Expected agent behavior:**
1. Calls `kb_autotag()` (no args or `file_path: "all"`)
2. Reports how many files were tagged and total tags added
3. Notes that `_index.yaml` was rebuilt automatically

**Check manually:**
- Open any feature file — `tags:` array is now populated
- Run `kb_ask({ question: "how does checkout work?" })` — `context_files` should include `features/checkout.md`

---

### J.2 Tag a single file (TC-28.2, TC-28.3)

```
"Tag only the auth feature file, and make sure my existing tags are kept"
→ kb_autotag({ file_path: "knowledge/features/auth.md" })
```

**Expected:** Only `features/auth.md` modified. Existing tags preserved (merged).

---

### J.3 Discover semantic relations — preview first (TC-29.1, TC-29.7)

```
"Show me what depends_on relations you'd add across the KB — don't write yet"
→ kb_autorelate({ dry_run: true })
```

**Expected agent behavior:**
1. Calls `kb_autorelate({ dry_run: true })`
2. Presents proposals in readable form: "I'd link `features/checkout.md → features/auth.md` (score 0.64, shared terms: auth, login)"
3. Notes cycles avoided if any

**Check:** Schema files appear as targets (upstream), feature/flow files appear as sources.

---

### J.4 Apply semantic relations (TC-29.2, TC-29.3)

```
"The proposals look good — apply them"
→ kb_autorelate()
```

**Expected:** Agent confirms how many relations were added and which files were updated. Second run returns `relations_added: 0`.

---

### J.5 Full enrichment pipeline (TC-28.6 + TC-29.2)

```
"Enrich the entire KB — first tag everything, then discover relations"
```

**Expected agent behavior:**
1. `kb_autotag()` — tag all files
2. `kb_autorelate({ dry_run: true })` — preview relations
3. Asks for confirmation
4. `kb_autorelate()` — apply relations
5. Verifies with `kb_ask` to confirm search now works

---

### J.6 Generate agent rule files (TC-30.1, TC-30.2)

```
"Generate the agent instruction files for Claude Code, Cursor, and Windsurf"
→ kb_scaffold({ type: "agent-rules" })
```

**Expected:**
- `CLAUDE.md`, `.cursorrules`, `.windsurfrules` created at project root
- Agent reports which files were written vs skipped
- Files contain KB-MCP instructions (`kb_ask`, `kb_get`, `kb_drift` sections)

---

### J.7 Regenerate agent rules after template change (TC-30.3)

```
"Regenerate all agent rule files from the latest template, overwriting existing ones"
→ kb_scaffold({ type: "agent-rules", force: true })
```

**Expected:** All three files updated even if they had existing content.

---

### J.8 Verify init generates agent rules (TC-30.4, TC-30.5)

```bash
mkdir test-agent-rules && cd test-agent-rules && git init
echo '{"name":"test"}' > package.json && git add . && git commit -m "init"
```

```
"Initialize the KB"
→ kb_init({ interactive: false })
```

**Expected:** `CLAUDE.md`, `.cursorrules`, `.windsurfrules` all appear after init.

```bash
# Verify custom CLAUDE.md is not overwritten
echo "# Custom rules" > CLAUDE.md
```

```
kb_init({ interactive: false })
```

**Expected:** `CLAUDE.md` still contains `# Custom rules`. Not overwritten.
