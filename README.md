# Testpad UI

Web interface for managing test runs in Testpad (Bitfinex) with functionalities to visualize, create, assign, and send invitation emails.

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
