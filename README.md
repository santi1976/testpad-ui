# Testpad Admin UI

A premium, internal dashboard for managing Bitfinex test execution. This tool enhances the Testpad experience by providing advanced analytics, batch operations, and unified test management.

```text
React 18 + TypeScript + Tailwind CSS + Vite + Radix UI
```

---

## 🚀 Quick Start

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Production build
npm run build
```

The application will be available at `http://localhost:5173`.

---

## 🛠️ Tech Stack & Architecture

| Layer | Technology |
|-------|------------|
| **Frontend** | React 18, TypeScript, Tailwind CSS |
| **UI Components** | [shadcn/ui](https://ui.shadcn.com/), Lucide Icons |
| **Logic & State** | TanStack Query (React Query) |
| **Routing** | React Router v6 |
| **Analytics** | Recharts (Pie charts, Progress bars) |
| **Proxy Server** | Node.js + Express (for Testpad API and web endpoints) |

---

## 📖 Features & Navigation

### 📊 Dashboard
The central hub for QA metrics. Includes:
- **Global Stats**: Instant view of Passed, Failed, and Blocked tests.
- **Visual Charts**: Interactive pie charts showing execution distribution.
- **Team Kanban**: Track tester workload and individual progress in real-time.

### 📁 Test Suites & Details
Organized by release (e.g., Release 1.135):
- **Browse Suites**: Expandable releases showing suite status (Sent, Pending, No Runs).
- **Deep Execution View**: See full test results (PASS/FAIL/BLOCK) for specific runs.
- **Run History**: Toggle between different runs of the same suite to see evolution.

### 🏃 Create Run
Streamlined batch run creation:
- **Project Selection**: Easily pick projects and filter folders.
- **Batch Creation**: Select multiple scripts and create runs with a single click.

### ✉️ Assignments & Email
Manage team distribution:
- **Tester Assignment**: Assign runs to specific testers.
- **Batch Notifications**: Send invitation emails to the entire team.
- **Tracking**: Client-side tracking of sent emails to avoid duplicates.

---

## ⚙️ Technical Configuration

### Authentication
The app uses a dual-auth system:
1. **Tester Login**: Users enter their own Testpad API Token and Password.
2. **System Account**: Used for sending batch emails. Configured via `.env`.

### Environment Variables (`.env`)
```env
# System user for assignments/emails (must be a manager/admin in Testpad)
USER_TESTPAD=system@bitfinex.com
PASSWORD_TESTPAD=your_secure_password
COMPANY_OID=your_company_oid
```

### Key Implementation Details
- **Email Tracking**: Since the Testpad API doesn't track if an invitation was sent, we use `localStorage` to mark sent emails, providing visual feedback in the UI.
- **Global Sidebar**: A unified navigation component (`Sidebar.tsx`) handles all routing and project context.
- **Shared Helpers**: Centralized logic in `src/utils/helpers.ts` for consistent data formatting (dates, initials, colors).

---

## 📦 Project Structure

```text
src/
├── api/                  # Specialized API services (Batch, Auth, Users)
├── components/           # UI and Layout components
│   ├── layout/           # Sidebar.tsx, Shell
│   ├── ui/               # shadcn/ui components
│   └── charts/           # Recharts implementations
├── contexts/             # AuthContext.tsx for session state
├── pages/                # Main feature pages (Dashboard, TestSuites, etc.)
├── types/                # Unified TypeScript interfaces
├── utils/                # api.ts client and shared helpers
└── App.tsx               # Primary Router configuration
```

---

## 📝 Usage Notes
- **API Limits**: The tool respects Testpad's API structure. Note that some values (like "Email Sent") are tracked only on the client where the action was performed.
- **Browser Compatibility**: Optimized for modern versions of Chrome and Safari.
- **Credentials**: Ensure your Testpad API Token has sufficient permissions (Manager role is recommended for all features).

---

**Bitfinex QA Team**
Saurabh Verna | saurabh.verna@bitfinex.com
Santiago Riveira | santiago.riveira@bitfinex.com
