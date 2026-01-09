# Testpad UI

Web interface for managing test runs in Testpad (Bitfinex) with functionalities to visualize, create, assign, and send invitation emails.

## 🔑 High Priority Information

### What to Reuse from This Repository

This repository contains reusable logic for **test run assignment and email sending** that can be extracted and adapted for other projects. The relevant files and code sections are documented at the end of this README under [Reusable Code for Assignment & Email Sending](#reusable-code-for-assignment--email-sending).

The assignment and email functionality supports both:
- **Individual assignment flows** - Assign and send email to one tester at a time
- **Batch assignment flows** - Assign and send emails to multiple testers simultaneously

### Why a Company Email is Required

The system user (`USER_TESTPAD` in `.env`) **must be a company-owned email account** because:

- All assignment and notification emails are sent **from this account**
- This includes emails for both individual and batch test run executions
- Using a company email ensures consistency, traceability, and correct email delivery behavior across environments

### Testpad Users Availability

**Important**: The selectable testers list comes from **already executed test runs**. This means:

- If a user is newly created in Testpad but has **not executed any test yet**, that user will **not appear** in the testers list
- Users only become available for assignment **after they have participated in at least one executed test run**
- This behavior is intentional and relies on historical execution data to determine valid assignment targets

## Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment Variables

Create a `.env` file in the root directory:

```env

# Users log in with their own API token via the login page
# The user's API token is stored in localStorage (NOT in .env)
# This token is only used as a fallback if no user is logged in
VITE_TESTPAD_API_TOKEN=your_api_token_here

# System User Credentials (REQUIRED for assigning runs and sending emails)
# Add the real Testpad password manually here for the system to assign runs and send emails
# This is a dedicated Testpad account used as the "sender" for email notifications
USER_TESTPAD=system_user@bitfinex.com
PASSWORD_TESTPAD=real_testpad_password_here

# Company OID (required for run assignment - specific to your Testpad account)
COMPANY_OID=your_company_oid_here

# Server port (optional, defaults to 5173)
PORT=5173
```

**Important Notes:**
- **User Login**: Each user **must** log in with their own Testpad credentials (Email + API Token)
  - The API token is **required** to use Testpad's REST API
  - The user's API token is stored in **localStorage** (NOT in .env) when they log in
  - Without a valid API token, no API operations can be performed
- **System User**: `USER_TESTPAD` and `PASSWORD_TESTPAD` are **manually added to .env** and used ONLY for:
  - Assigning runs via internal web endpoints
  - Sending emails via internal web endpoints
  - NOT used for user authentication or REST API operations
- **API Token Storage**: User's API token is stored in localStorage after login; `VITE_TESTPAD_API_TOKEN` in `.env` is only a fallback for development/testing

### 3. Run Development Server
```bash
npm run dev
```

The application will be available at `http://localhost:5173`

## Features

- **Visualize** test runs with advanced filters
- **Create** new test runs
- **Assign** test runs to users or guests
- **Send** invitation emails 
- **User Authentication** - Each user logs in with their own Testpad API token

## ⚠️ Important Limitations

### No Bidirectional Sync with Testpad


The Testpad API does not expose:
- ❌ Email sent status - Cannot determine if tester was already notified
- ❌ Assignment history - Cannot track who assigned a run or when
- ❌ Assignment source - Cannot distinguish if assigned from Testpad or this app

**Run States:**
- `new` - No one started testing (may or may not be assigned) - **Can be assigned or reassinged and email can be sent**
- `started` - Someone is actively testing (definitely assigned) - **Cannot be assigned or send email**
- `completed` - Testing finished - **Cannot be assigned or send email**

**Important:** 
- A run with `state = 'new'` does NOT mean it's unassigned. It only means testing hasn't started yet.
- Only runs with `state = 'new'` can be assigned / reassgned and have emails sent. Once a run is `started` or `completed`, assignment and email sending are disabled.

**Recommendations:**

1. When in doubt: Check Testpad directly for the most accurate assignment info

For detailed information about these limitations, see [PROJECT-OVERVIEW.md](./PROJECT-OVERVIEW.md#no-bidirectional-sync).

## Technologies

- **React 18** - UI framework
- **Vite** - Build tool and dev server
- **React Query** - State management and API caching
- **Ant Design** - UI components
- **Node.js/Express** - Backend server

## 📖 Documentation

For detailed information about the project architecture, API limitations, and implementation details, see:

- **[PROJECT-OVERVIEW.md](./PROJECT-OVERVIEW.md)** - Complete project documentation, architecture, and technical details
- **[TESTPAD-API-OFFICIAL.md](./TESTPAD-API-OFFICIAL.md)** - Official Testpad API documentation

> 💡 **Want to know more?** Check out [PROJECT-OVERVIEW.md](./PROJECT-OVERVIEW.md) for a comprehensive explanation of the architecture, why we use two authentication methods, API limitations, and how we discovered the internal endpoints.

---

## Reusable Code for Assignment & Email Sending

The following files and code sections can be extracted and reused in other projects that need similar assignment and email functionality.

### Backend: Assignment & Email Endpoint

**File**: `server.js`

**Endpoint**: `/api/assign-and-send` (POST)

**Location**: Lines `223-336`

**Purpose**: Handles the complete flow of assigning a test run to a tester and sending the invitation email via Testpad's internal web endpoints.

**Key Functions**:
- `ensureLoggedIn()` - Maintains authenticated session with Testpad (lines `65-156`)
- Assignment via `/a/script/{scriptId}/run/{runId}/setmeta` endpoint (lines `243-293`)
- Email sending via `/a/script/{scriptId}/run/{runId}/sendemail` endpoint (lines `295-330`)

**Required Environment Variables**:
- `USER_TESTPAD` - Company email account for sending emails
- `PASSWORD_TESTPAD` - Password for the company email account
- `COMPANY_OID` - Company Object ID from Testpad

### Frontend: Assignment API Client

**File**: `src/api/assignAndSendEmail.js`

**Location**: Lines `1-37`

**Purpose**: Frontend API client that calls the backend assignment endpoint.

**Usage**:
```javascript
import { assignAndSendEmail } from '../api/assignAndSendEmail'

await assignAndSendEmail(scriptId, runId, targetEmail, scriptName)
```

### Frontend: Email Tracking Utility

**File**: `src/utils/emailTracking.js`

**Location**: Lines `1-117`

**Purpose**: Client-side tracking of sent emails using `localStorage` (since Testpad API doesn't expose email sent status).

**Key Functions**:
- `markEmailSent(scriptId, runId, recipientEmail)` - Mark a run as sent (lines `62-90`)
- `hasEmailSent(scriptId, runId)` - Check if email was sent (lines `98-102`)
- `getEmailRecipient(scriptId, runId)` - Get recipient email (lines `39-54`)

### Frontend: Individual Assignment Implementation

**File**: `src/pages/CreateAndAssign.jsx`

**Location**: Lines `294-317`

**Purpose**: Example implementation of individual assignment flow.

**Key Function**: `handleAssignAndSend()` - Handles assignment and email sending for a single run.

### Frontend: Batch Assignment Implementation

**File**: `src/pages/AssignmentsAndEmail.jsx`

**Location**: 
- Batch assignment state: Lines `52-55`
- Batch assignment UI: Lines `467-650` (approximate)
- Batch assignment handler: `handleSendEmails()` - Lines `292-353`
- Apply bulk tester: `applyBulkTester()` - Lines `269-283`
- Individual tester assignment: `setRunTester()` - Lines `285-290`

**Purpose**: Example implementation of both individual and batch assignment flows.

**Key Features**:
- Select multiple runs for batch assignment (`toggleRunSelection`, `selectAllNew` - Lines `246-267`)
- Apply same tester to multiple runs (`applyBulkTester` - Lines `269-283`)
- Send emails to multiple testers at once (`handleSendEmails` - Lines `292-353`)
- Track email sent status per run using `emailTracking.js`

### Integration Notes

1. **Backend Dependencies**: The assignment endpoint requires Testpad web session authentication (cookies + CSRF token), not just API tokens.

2. **Email Tracking**: Since Testpad API doesn't track email sent status, the `emailTracking.js` utility uses `localStorage` to maintain this information client-side.

3. **User Selection**: The list of available testers is derived from existing test executions (see [Testpad Users Availability](#testpad-users-availability) above).

4. **Run States**: Only runs with `state = 'new'` can be assigned. Runs that are `started` or `completed` cannot be assigned or have emails sent.

For more detailed integration instructions, see the code comments in the files listed above.
