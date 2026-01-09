# Project Overview - Testpad UI

## 📋 Summary

This project is a web interface for managing test runs in Testpad (Bitfinex), with functionalities to:
- **Visualize** test runs with advanced filters
- **Create** new test runs
- **Assign** test runs to users or guests
- **Send** invitation emails 

---

## 🎯 Project Objective

Create a web interface that allows efficient management of test runs in Testpad, assigning and sending emails (individual and batch)
---



## 🔑 Why Two Authentication Methods?

### Main Problem

The official Testpad REST API has **significant limitations so far**:

1. ❌ **Cannot assign testers** - The `tester` field is ignored when creating runs
2. ❌ **Cannot update runs** - Runs are read-only once created
3. ❌ **No email endpoints** - No REST endpoints for sending notifications
4. ❌ **Cannot create users** - No user management endpoints
5. ❌ **Cannot retrieve users** - No endpoints to get user list

### Implemented Solution

**API Token (`VITE_TESTPAD_API_TOKEN`):**
- ✅ Create runs: `POST /api/v1/scripts/{id}/runs`
- ✅ Read data: projects, scripts, runs, etc.
- ✅ Basic CRUD operations
- ❌ Cannot assign testers
- ❌ Cannot send emails
- ❌ Cannot manage users

**Programmatic Login (username/password):**
- ✅ Assign runs: `/a/script/{id}/run/{id}/setmeta` (internal web endpoint)
- ✅ Send emails: `/a/script/{id}/run/{id}/sendemail` (internal web endpoint)
- ❌ More complex (requires cookie and CSRF token handling)

### Conclusion

**Both methods are necessary** for different purposes:
- **Token** → Simple and fast operations (create, read)
- **Login** → Complex operations that the REST API doesn't support (assign, send emails)

---

## 📁 Project Structure

```
testpad-ui/
├── server.js                    # Backend: Express + Vite middleware
├── vite.config.js               # Vite configuration and proxy
├── package.json                 # Dependencies and scripts
│
├── src/
│   ├── main.jsx                 # React entry point
│   ├── App.jsx                  # Main component
│   │
│   ├── pages/                   # Main pages
│   │   ├── Dashboard.jsx        # General dashboard
│   │   ├── CreateAndAssign.jsx  # Create runs and assign
│   │   ├── AssignmentsAndEmail.jsx # View and assign runs
│   │   ├── Runs.jsx             # Test executions management
│   │   └── ...
│   │
│   ├── api/                     # Testpad-specific functions
│   │   ├── assignAndSendEmail.js # Assign and send email (calls backend)
│   │   ├── createRuns.js        # Create runs (uses REST API)
│   │   └── ...
│   │
│   ├── utils/                   # Generic utilities
│   │   └── api.js               # Base HTTP functions (GET, POST, PATCH, etc.)
│   │
│   ├── components/              # Reusable components
│   │   ├── Navbar.jsx
│   │   └── ...
│   │
│   └── contexts/               # React contexts
│       └── AuthContext.jsx
│
└── docs/                        # Documentation
    └── TESTPAD-API-OFFICIAL.md  # Official API documentation
```

---

## 🔄 Data Flow

### 1. Create a Run

```
User → CreateAndAssign.jsx
    ↓
createRunAPI() (uses token)
    ↓
POST /api/v1/scripts/{id}/runs
    ↓
Testpad REST API
    ↓
Run created (but without tester assigned)
```

### 2. Assign Run and Send Email

```
User → AssignmentsAndEmail.jsx
    ↓
assignAndSendEmail() (frontend)
    ↓
POST /api/assign-and-send (backend)
    ↓
server.js:
    1. ensureLoggedIn() → Programmatic login if needed
    2. POST /a/script/{id}/run/{id}/setmeta → Assign run
    3. POST /a/script/{id}/run/{id}/sendemail → Send email
    ↓
Testpad Web App (internal endpoints)
    ↓
Run assigned + Email sent
```

---

## 🔐 Authentication and Session

### User Authentication (Frontend)

Each user authenticates with their own Testpad credentials:

**Login Flow:**
1. User enters: **Email** (`usuario@bitfinex.com` or `usuario@tether.com`) + **API Token** (their personal Testpad API token)
2. Frontend calls: `POST /api/validate-login` with `{ email, apiToken }`
3. Backend validates: Makes a test API call to Testpad with the token (`GET /api/v1/projects`)
4. If valid: User is authenticated, token stored in localStorage
5. All API calls use the user's token (from localStorage) instead of the system token

**Why Each User Needs Their Own API Token:**
- Each API token has specific permissions and access to different projects/scripts
- Users can only see and manage scripts they have access to
- Security: Each user operates with their own permissions, not a shared system token
- The user's token is used for all REST API operations (reading projects, scripts, runs, creating runs, etc.)

### System Authentication (Backend)

The backend uses system credentials for sending emails:

```javascript
// Session stored in memory (use Redis in production)
let sessionData = {
  cookies: '',
  csrfToken: '',
  lastLogin: null
}

// Automatically renews session if expired (TTL: 10 minutes)
async function ensureLoggedIn() {
  const SESSION_TTL = 10 * 60 * 1000
  if (!sessionData.cookies || 
      !sessionData.lastLogin || 
      (Date.now() - sessionData.lastLogin) > SESSION_TTL) {
    await loginToTestpad() // Uses USER_TESTPAD + PASSWORD_TESTPAD from .env
  }
  return sessionData
}
```

**System Login Process:**
1. GET `/login?acct=bitfinex` → Get login page and CSRF token
2. POST `/login` → Send system credentials (USER_TESTPAD + PASSWORD_TESTPAD)
3. Follow redirects → Get final cookies
4. Extract CSRF token from cookies

**System credentials are ONLY used for:**
- Sending emails via `/a/script/{id}/run/{id}/sendemail`
- Assigning runs via `/a/script/{id}/run/{id}/setmeta`
- NOT for user authentication or REST API operations

---

## 🛠️ Technologies Used

### Frontend
- **React 18** - UI framework
- **Vite** - Build tool and dev server
- **React Query (TanStack Query)** - State management and API caching
- **Ant Design** - UI components
- **React Router** - Navigation

### Backend
- **Node.js** - Runtime
- **Express** - Web framework
- **Vite (middleware mode)** - Serve frontend in development
- **dotenv** - Environment variables

---

## 📝 Environment Variables

Create `.env` file in the root:

```env
# API Token (optional - fallback for development/testing)
# Users log in with their own API token via the login page
# The user's API token is stored in localStorage (NOT in .env)
# This token is only used as a fallback if no user is logged in
VITE_TESTPAD_API_TOKEN=your_token_here

# System User Credentials (REQUIRED - manually add real Testpad password)
# Add the real Testpad password manually here for the system to assign runs and send emails
# This is a dedicated Testpad account used as the "sender" for email notifications
USER_TESTPAD=system_user@bitfinex.com
PASSWORD_TESTPAD=real_testpad_password_here

# Company OID (required for run assignment - specific to your Testpad account)
COMPANY_OID=your_company_oid_here

# Server port (optional)
PORT=5173
```

**Authentication Model:**
- **User Login**: Each user **must** authenticate with their own Testpad credentials (Email + API Token)
  - The API token is **required** - without it, Testpad's REST API cannot be used
  - The API token is validated against Testpad's API on login
  - **The user's API token is stored in localStorage** (NOT in .env) after successful login
  - Each user's token has specific permissions and access to different projects/scripts
  - The user's token is used for all REST API operations (reading projects, scripts, runs, creating runs, etc.)
- **System User**: The `USER_TESTPAD` and `PASSWORD_TESTPAD` credentials are **manually added to .env** and used ONLY for:
  - Assigning runs via internal web endpoints (`/a/script/{id}/run/{id}/setmeta`)
  - Sending emails via internal web endpoints (`/a/script/{id}/run/{id}/sendemail`)
  - NOT used for user authentication or REST API operations
- **API Token Storage**: 
  - User's API token → Stored in **localStorage** when they log in (NOT in .env)
  - `VITE_TESTPAD_API_TOKEN` in `.env` → Only a fallback for development/testing when no user is logged in

---

## 🚀 Available Scripts

```bash
# Development (starts backend + frontend)
npm run dev

# Vite only (frontend only, no backend)
npm run dev:vite

# Preview build
npm run preview
```

---

## 🔍 Backend Endpoints

### `POST /api/assign-and-send`

Assigns a run as Guest and sends invitation email.

**Request:**
```json
{
  "scriptId": "12345",
  "runId": "678",
  "targetEmail": "user@example.com",
  "scriptName": "Test Script Name"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Run assigned and email sent to user@example.com"
}
```

**Internal Process:**
1. Verify/renew session
2. Generate ObjectId for the run
3. `POST /a/script/{id}/run/{id}/setmeta` → Assign run as Guest
4. `POST /a/script/{id}/run/{id}/sendemail` → Send email

---

## ⚠️ Known Limitations

### Official Testpad REST API Limitations

According to the official API documentation (`TESTPAD-API-OFFICIAL.md`) and our experience:

#### 1. HTTP Methods
- ❌ **No PUT support** - Only GET, POST, and PATCH are supported
- ❌ **No DELETE support** - Objects cannot be deleted via API

#### 2. Run Management
- ❌ **Cannot update existing runs** - Runs are read-only once created
- ❌ **Cannot assign testers when creating runs** - The `tester` field is ignored in `POST /api/v1/scripts/{id}/runs`
- ❌ **No retest support** - Cannot create retests of test runs via API

#### 3. User Management
- ❌ **Cannot create users** - No endpoints for user creation
- ❌ **Cannot retrieve users** - No endpoints to get user list
- **Workaround:** Extract user emails from run labels/headers by parsing existing runs

#### 4. Email/Notifications
- ❌ **No email endpoints** - The REST API does not provide endpoints for sending emails
- **Note:** Email/notification functionality is typically part of REST APIs (e.g., `POST /runs/{id}/send-email` or `POST /runs/{id}/notify`), but Testpad's official API does not include these endpoints yet
- **Workaround:** We discovered and use internal web endpoints (`/a/script/{id}/run/{id}/sendemail`) via programmatic login

### `setmeta` and `sendemail`

Since the official REST API doesn't support assigning runs or sending emails, we reverse-engineered the web interface to find the internal endpoints:

1. **Network Inspection:**
   - Opened Testpad web interface in browser (https://bitfinex.testpad.com)
   - Used browser DevTools Network tab to monitor all HTTP requests
   - Performed the "assign and send email" action manually through the UI
   - Captured the actual API calls made by the web interface

2. **Endpoint Discovery:**
   - Found `POST /a/script/{id}/run/{id}/setmeta` - Internal endpoint used to assign runs
   - Found `POST /a/script/{id}/run/{id}/sendemail` - Internal endpoint used to send invitation emails
   - These are **not documented** in the official API and are internal to the web application

3. **Payload Analysis:**
   - Analyzed the request payloads sent by the web interface
   - Identified all required fields and data structure (ObjectId format, field mappings, etc.)
   - Documented the exact JSON structure needed for each endpoint
   - Replicated the exact format in our backend code

4. **Authentication Requirements:**
   - Discovered these endpoints require:
     - Valid session cookies (from authenticated login)
     - CSRF token in `X-Csrftoken` header
     - Proper `Referer` and `Origin` headers
   - This is why we need programmatic login instead of just using the API token

5. **Implementation:**
   - Implemented programmatic login to obtain session cookies and CSRF tokens
   - Used the discovered endpoints with the correct payload format
   - Successfully replicated the web interface functionality

**Key Insight:** These endpoints (`setmeta` and `sendemail`) are internal web application endpoints, not part of the official REST API (`/api/v1/...`). They are used by the Testpad web interface itself and require authenticated session cookies and CSRF tokens. This is why we need programmatic login instead of just using the API token.

**Why This Works:** The web interface uses these endpoints, so by replicating the exact requests (headers, payload format, authentication), we can achieve the same functionality programmatically.

### Current Solution

- Use programmatic login for operations that the REST API doesn't support
- This requires maintaining an active session (TTL: 10 minutes)
- In production, consider using Redis for shared sessions

### No Bidirectional Sync

**There is no correlation between this application and Testpad's native interface.**

The Testpad API does not expose:

| Data | Available in API? | Consequence |
|------|-------------------|-------------|
| Email sent status | ❌ No | Cannot determine if tester was already notified |
| Assignment history | ❌ No | Cannot track who assigned a run or when |
| Assignment source | ❌ No | Cannot distinguish if assigned from Testpad or this app |
| Run state | ✅ Yes | Only indicates: `new`, `started`, `completed` |

#### Run States Explained

```
┌─────────────┬────────────────────────────────────────────────────────────┬──────────────────────────────┐
│ API State   │ Real Meaning                                               │ Assignment & Email            │
├─────────────┼────────────────────────────────────────────────────────────┼──────────────────────────────┤
│ new         │ No one started testing (may or may not be assigned)        │ ✅ Can assign & send email   │
│ started     │ Someone is actively testing (definitely assigned)          │ ❌ Cannot assign or send     │
│ completed   │ Testing finished                                           │ ❌ Cannot assign or send     │
└─────────────┴────────────────────────────────────────────────────────────┴──────────────────────────────┘
```

**Important:** 
- A run with `state = 'new'` does NOT mean it's unassigned. It only means testing hasn't started yet.
- **Only runs with `state = 'new'` can be assigned and have emails sent.** Once a run is `started` or `completed`, assignment and email sending are disabled.

#### Undetectable Scenarios

**Scenario 1: Assignment from this App**
```
User creates run → Assigns tester → Sends email → Run stays "new"
```
- The run remains in `new` state until the tester opens Testpad and starts testing
- There's no way to mark or track that the assignment/email was already done
- If user returns to "Assignments & Email" page, the run appears available for assignment again

**Scenario 2: Assignment from Testpad Official**
```
Someone assigns a run directly in testpad.com → Sends email from Testpad
```
- This application has no visibility into this action
- The run will still appear as "assignable" in our interface
- Duplicate emails may be sent if reassigned from our app

**Scenario 3: Mixed Usage**
```
Run created in Testpad → Assigned in our app → Modified in Testpad
```
- Changes made in Testpad are not reflected in our tracking
- No single source of truth exists

#### Design Decisions

Given these limitations, we made the following architectural decisions:

1. **State-Based Assignment Logic**
   - `new` → Available for assignment and email sending (show in batch assignment)
   - `started` → Disabled - cannot assign or send email (someone is testing)
   - `completed` → Disabled - cannot assign or send email (testing finished)

2. **No Local Persistence**
   - We chose NOT to implement a local database to track assignments because:
     - It would create a false sense of accuracy
     - It cannot sync with Testpad's native assignments
     - It would become stale if users switch between interfaces

3. **User Warning**
   - Both "Create Run" and "Assignments & Email" pages display a warning:
     > This app does not sync with Testpad's native assignment system. Runs marked as "New" may have already been assigned through Testpad directly.

4. **Batch Assignment Focus**
   - The "Assignments & Email" page is optimized for:
     - Viewing all `new` runs at once
     - Assigning multiple runs to different testers
     - Sending emails in batch
     - NOT for tracking what was previously assigned

#### Page-Specific Behavior

**Create Run Page**
- Creates new runs from selected test scripts
- Allows immediate assignment and email sending
- **Limitation:** If user navigates away before assigning, the run appears in "Assignments & Email" as unassigned

**Assignments & Email Page**
- Shows all runs (filterable by state)
- Default filter: `state = 'new'` (ready to assign)
- Allows batch assignment to multiple testers
- **Limitation:** Cannot distinguish between "never assigned" and "assigned but not started"

**Dashboard**
- Shows run progress and statistics
- Reflects real-time state from Testpad API
- **Limitation:** Assignment info may be incomplete



#### Summary

| Feature | Works? | Notes |
|---------|--------|-------|
| Create runs | ✅ Yes | Fully functional |
| Assign & send email | ✅ Yes | Works, tracked locally |
| View run progress | ✅ Yes | Real-time from API |
| Track sent emails | ✅ Yes | Local tracking via localStorage |
| Sync with Testpad UI | ❌ No | No bidirectional sync |
| Detect prior assignments | ❌ No | Only state is available |

---

## 📧 Email Tracking System

### Overview

Since the Testpad API does not expose email sent status, we implemented a **client-side tracking system** using `localStorage` to track which runs have had emails sent and to whom.

### Implementation

**File**: `src/utils/emailTracking.js`

**Storage Format**:
- **Storage Key**: `testpad_emails_sent`
- **Data Structure**: Object mapping `scriptId-runId` to recipient email
  ```javascript
  {
    "12345-678": "user@example.com",
    "12345-679": "another@example.com"
  }
  ```

**Key Functions**:
- `markEmailSent(scriptId, runId, recipientEmail)` - Marks a run as sent and stores recipient
- `hasEmailSent(scriptId, runId)` - Checks if email was sent for a specific run
- `getEmailRecipient(scriptId, runId)` - Retrieves the recipient email for a sent run
- `getEmailsSentRuns()` - Returns all tracked runs
- `clearEmailSentTracking()` - Clears all tracking data

### Migration Support

The system includes automatic migration from an older array-based format to the current object-based format that stores recipient emails:

```javascript
// Old format (array): ["12345-678", "12345-679"]
// New format (object): { "12345-678": "user@example.com", ... }
```

### Limitations

1. **Client-Side Only**: Data is stored in browser's `localStorage`, so:
   - It's per-browser/per-device (not shared across devices)
   - It can be cleared by the user
   - It doesn't persist across different browsers

2. **No Server-Side Sync**: The tracking is not synchronized with Testpad's database, so:
   - If a run is assigned/emailed from Testpad directly, our tracking won't know
   - If the user clears browser data, tracking is lost
   - Multiple users won't see each other's tracking

3. **Reassignment Tracking**: When a run is reassigned to a different tester, the tracking is updated with the new recipient email, allowing visibility into who the email was last sent to.

### Usage in UI

The email tracking is used throughout the application to:
- Display "Email Sent" status on run cards and tables
- Show recipient information when available
- Pre-fill assignment fields with previous recipients for reassignment
- Prevent duplicate email sends (user decision based on displayed status)

---

## 👥 User Selection Logic

### Overview

Since Testpad's API doesn't provide endpoints to retrieve the list of users, we extract user emails from **existing test run executions**. This means only users who have executed at least one test run will appear in the assignment list.

### Extraction Process

**Location**: `src/pages/AssignmentsAndEmail.jsx` (lines `195-208`)

The system extracts tester emails from multiple sources in the run data:

1. **From Run Headers**:
   ```javascript
   run.headers?._tester  // Primary source
   run.headers?.tester    // Fallback
   ```

2. **From Run Assignee**:
   ```javascript
   run.assignee?.email    // For guest runs
   ```

3. **From Run Labels** (legacy format):
   ```javascript
   // Label format: "number / email / date / status"
   run.label.split(' / ')[1]  // Extract email from label
   ```

4. **From Run Field Data**:
   ```javascript
   run.fielddata[1]?.raw  // Guest email stored in fielddata
   run.fields["1"]        // Alternative field format
   ```

### User List Generation

```javascript
// Get unique testers from all runs
const allTesters = useMemo(() => {
  const testerSet = new Set()
  allRuns.forEach(run => {
    if (run.tester && run.tester.includes('@')) {
      testerSet.add(run.tester)
    }
  })
  // Also include testers from current assignments (for reassignment)
  Object.values(runAssignments).forEach(email => {
    if (email && email.includes('@')) testerSet.add(email)
  })
  return Array.from(testerSet).sort()  // Alphabetically sorted
}, [allRuns, runAssignments])
```

### Important Behavior

1. **Only Executed Runs**: Users must have executed at least one test run to appear in the list
2. **New Users**: Newly created Testpad users who haven't executed any tests won't appear until they complete their first test execution
3. **Guest Testers**: Guest testers (identified by email in fielddata) are also included in the list
4. **Deduplication**: The system uses a `Set` to ensure each email appears only once
5. **Sorting**: The final list is sorted alphabetically for easy selection

### Guest vs Registered User Detection

The system distinguishes between guest testers and registered users:

**Guest Detection** (multiple methods):
- `run.headers._tester === 'guest'`
- `run.assignee.id === '_guest'` or `run.assignee.id === '0'`
- `run.assignee.name === 'guest'`

**Registered User Detection**:
- Email found in `run.headers._tester` (and not 'guest')
- Email found in `run.assignee.email` (for registered users)

---

## 📦 Batch Assignment Implementation

### Overview

The batch assignment feature allows users to select multiple test runs and assign them to testers, then send invitation emails in batch. This is implemented in `src/pages/AssignmentsAndEmail.jsx`.

### Key Components

#### 1. Selection State Management

```javascript
// Track selected run IDs
const [selectedRunIds, setSelectedRunIds] = useState(new Set())

// Track assignments per run (runId -> email)
const [runAssignments, setRunAssignments] = useState({})

// Track bulk tester for applying to multiple runs
const [bulkTester, setBulkTester] = useState(null)
```

#### 2. Selection Functions

- `toggleRunSelection(runId)` - Toggle individual run selection
- `selectAllNew()` - Select all runs with `state === 'new'`
- `clearSelection()` - Clear all selections

#### 3. Bulk Assignment

**Function**: `applyBulkTester()` (lines `269-283`)

Applies the same tester email to all selected runs:

```javascript
const applyBulkTester = () => {
  if (!bulkTester) {
    message.warning('Please select a tester first')
    return
  }
  const newAssignments = { ...runAssignments }
  selectedRunIds.forEach(runId => {
    const run = allRuns.find(r => r.id === runId)
    if (run && run.state === 'new') {
      newAssignments[runId] = bulkTester
    }
  })
  setRunAssignments(newAssignments)
  message.success(`Applied ${bulkTester.split('@')[0]} to ${selectedRunIds.size} runs`)
}
```

#### 4. Individual Assignment

**Function**: `setRunTester(runId, email)` (lines `285-290`)

Allows assigning a specific tester to a single run:

```javascript
const setRunTester = (runId, email) => {
  setRunAssignments(prev => ({
    ...prev,
    [runId]: email
  }))
}
```

#### 5. Batch Email Sending

**Function**: `handleSendEmails()` (lines `292-353`)

Processes all selected runs that have a tester assigned:

**Process Flow**:
1. Filter runs: Selected + `state === 'new'` + Has assigned tester
2. For each run:
   - Mark as "sending" (show loading indicator)
   - Call `assignAndSendEmail()` API
   - Mark email as sent in localStorage
   - Remove from selection on success
   - Clear assignment from state
3. Show success/error summary
4. Refetch data to update UI

**Error Handling**:
- Continues processing even if individual emails fail
- Tracks success and error counts separately
- Shows summary message with counts
- Logs errors to console for debugging

**State Updates**:
- Uses `sendingRunIds` Set to track which runs are currently being processed
- Updates UI in real-time as each email is sent
- Automatically removes successfully sent runs from selection

### Sorting and Organization

Runs are sorted for better usability:
1. **Primary Sort**: By Test Suite name (alphabetically)
2. **Secondary Sort**: By Run Number (descending - newest first)

This ensures runs from the same test suite are grouped together, with the most recent runs appearing first.

### UI Features

- **Checkbox Selection**: Individual run selection with checkboxes
- **Select All**: Quick action to select all `new` runs
- **Bulk Tester Dropdown**: Apply same tester to all selected runs
- **Individual Tester Dropdown**: Assign different testers per run
- **Send Button**: Disabled until runs are selected and testers assigned
- **Progress Indicators**: Shows which runs are currently being processed
- **Status Display**: Shows "Email Sent" status with recipient information

---

## 🔄 Complete Flow: Create → Assign → Send Email

### Step 1: Create Run
```javascript
// Frontend: CreateAndAssign.jsx
const run = await createRunAPI(scriptId)
// Uses: POST /api/v1/scripts/{id}/runs (with token)
```

### Step 2: Assign and Send Email
```javascript
// Frontend: AssignmentsAndEmail.jsx
await assignAndSendEmail(scriptId, runId, email, scriptName)
// Calls: POST /api/assign-and-send (backend)
// Backend uses programmatic login for:
// - setmeta (assign)
// - sendemail (send)
```

---

## 📚 Related Documentation

- **`TESTPAD-API-OFFICIAL.md`** - Official REST API documentation

---

## 🔮 Future Improvements


1. **Folder/Version Archiving** - Automatically archive current folder/version and generate the next one
   - Implement automatic versioning system
   - Archive old versions when creating new ones
   - Maintain version history and rollback capability

---

## 📞 Support

For issues or questions:
- Review documentation in `/docs`
- Check server logs
- Consult official documentation: https://api-docs.testpad.com

---

**Last updated:** January 2025
