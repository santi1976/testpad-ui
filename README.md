# Testpad Admin

Internal tool for managing test runs, assignments, and team coordination with Testpad API.

```
React 18 + TypeScript + Tailwind CSS + Vite
```

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 18, TypeScript, Tailwind CSS |
| State | TanStack Query (React Query) |
| UI Components | shadcn/ui, Radix UI |
| Charts | Recharts |
| Routing | React Router v6 |
| Build | Vite |
| Backend | Node.js + Express (proxy) |

---

## Quick Start

```bash
# Install
npm install

# Dev server
npm run dev

# Build
npm run build
```

Open `http://localhost:5173`

---

## Environment

Create `.env` in root:

```env
# API Token (fallback for development)
VITE_TESTPAD_API_TOKEN=your_api_token

# System user for assignments/emails
USER_TESTPAD=system@bitfinex.com
PASSWORD_TESTPAD=password_here
COMPANY_OID=your_company_oid
```

> Users log in with their own API token. System credentials are only for sending assignment emails.

---

## Features

| Feature | Description |
|---------|-------------|
| Dashboard | Stats, pie charts, progress bars, team kanban |
| Create Run | Select scripts, create runs in batch |
| Assignments | Batch assign testers, send invitation emails |
| Test Suites | Browse projects, folders, scripts by release |
| Settings | API connection, Slack integration config |

---

## Pages

| Route | Component | Description |
|-------|-----------|-------------|
| `/` | Dashboard | Analytics and team status |
| `/create-run` | CreateAndAssign | Create new test runs |
| `/assignments` | AssignmentsAndEmail | Assign testers, send emails |
| `/test-suites` | App | Browse test suites by project |
| `/test-suite/:name` | TestSuiteDetails | View test cases and run details |
| `/settings` | Settings | Configuration |
| `/login` | Login | Authentication |

---

## Project Structure

```
src/
├── api/                  # API calls
│   ├── assignAndSendEmail.ts
│   ├── createRuns.ts
│   ├── getCredentials.ts
│   ├── getUsers.ts
│   └── login.ts
├── components/
│   ├── charts/           # Recharts components
│   │   └── results-pie-chart.tsx
│   ├── ui/               # shadcn/ui components
│   │   ├── button.tsx
│   │   ├── card.tsx
│   │   ├── progress-bar.tsx
│   │   ├── stat-card.tsx
│   │   ├── tester-kanban-board.tsx
│   │   └── ...
│   ├── Navbar.tsx
│   └── UserMenu.tsx
├── contexts/
│   └── AuthContext.tsx   # Auth state management
├── hooks/                # Custom hooks
├── pages/
│   ├── Dashboard.tsx
│   ├── CreateAndAssign.tsx
│   ├── AssignmentsAndEmail.tsx
│   ├── TestSuiteDetails.tsx
│   ├── Settings.tsx
│   └── Login.tsx
├── types/
│   └── index.ts          # TypeScript types
├── utils/
│   ├── api.ts            # API client
│   └── emailTracking.ts  # Local email tracking
├── App.tsx               # Test Suites page
├── main.tsx              # Router setup
└── index.css             # Tailwind + CSS variables
```

---

## API Limitations

Testpad API does not expose:

| Not Available | Workaround |
|---------------|------------|
| Email sent status | Track locally with `localStorage` |
| Assignment history | N/A |
| Assignment source | N/A |

**Run States:**

| State | Can Assign | Can Send Email |
|-------|------------|----------------|
| `new` | Yes | Yes |
| `started` | No | No |
| `completed` | No | No |

---

## Authentication

| Method | Purpose |
|--------|---------|
| User API Token | REST API calls (stored in localStorage) |
| System Credentials | Assignment emails (stored in .env) |

---

## Key Files

| File | Purpose |
|------|---------|
| `server.js` | Express proxy for Testpad web endpoints |
| `src/utils/api.ts` | API client with auth |
| `src/utils/emailTracking.ts` | LocalStorage email tracking |
| `src/api/assignAndSendEmail.ts` | Assignment + email API |

---

## UI Design

| Element | Style |
|---------|-------|
| Sidebar | Dark (#121827) |
| Primary | Blue (hsl 217 91% 60%) |
| Selected Dropdown | Cyan highlight |
| Cards | White + subtle borders |

---

## Scripts

```bash
npm run dev      # Start dev server
npm run build    # Production build
npm run preview  # Preview production build
npm run lint     # ESLint
```

---

## Notes

- Testers list comes from executed test runs only
- Email tracking is client-side (localStorage)
- Test suite URLs use slug names, ID in sessionStorage
- System email account required for sending notifications

---

## Docs

- [CHECKPOINT.md](./CHECKPOINT.md) - Project state
- [TESTPAD-API-OFFICIAL.md](./TESTPAD-API-OFFICIAL.md) - API reference

---

**Bitfinex QA Team**
