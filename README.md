# BuildTrack - Automated Photo-Based Quality Assurance System

A modern, demo-ready web application powered by React, Vite, Tailwind CSS, and shadcn/ui components. It allows construction/site teams to upload daily photos, automatically track progress, update a Gantt chart, and maintain visual proof of work for quality assurance and liability protection.

## 🎯 Core Value Proposition

- **Transparency** → Visual proof of daily work
- **Automation** → Gantt updates without manual reporting
- **Accountability** → Timestamped records
- **Persuasion Tool** → Demo app to convince stakeholders

## ✨ Features

### Dashboard
- **Project Overview Cards**: Real-time stats with icons showing total tasks, completed items, in-progress work, average progress, and photo count
- **Interactive Gantt Chart**: Visual timeline with color-coded progress bars
- **Recent Activity Feed**: Quick view of the latest photo uploads with avatars
- **Photo Upload Modal**: Drag-and-drop interface with smart task auto-selection

### Timeline View
- **Chronological Feed**: All photos organized by date with elegant separators
- **Visual Proof Cards**: Image thumbnails with task associations and timestamps
- **Progress Tracking**: Shows how photos automatically update task progress

### Task View
- **Detailed Table View**: All tasks grouped by category with complete information
- **Status Badges**: Beautiful badges with proper color coding
- **Progress Bars**: Smooth animated progress indicators
- **Photo Counts**: Avatar stacks showing associated photos
- **Timeline Info**: Start/end dates and schedule status

### Smart Features
- **Auto Task Detection**: System analyzes filenames to suggest relevant tasks
- **Progress Automation**: Photo uploads automatically increase task progress by 20%
- **Status Transitions**: Tasks automatically move from "Not Started" → "In Progress" → "Completed"
- **Smart Upload Modal**: With file preview and task association

## 🎨 Technology Stack

### Frontend
- **React 19** - UI framework with hooks
- **Vite** - Lightning-fast build tool and dev server
- **TypeScript** - Full type safety
- **Tailwind CSS v4** - Utility-first styling
- **shadcn/ui** - Beautiful, accessible components

### UI Components
- **Radix UI** - Headless, accessible primitives
- **Lucide React** - Modern icon library
- **class-variance-authority** - Variant-based styling
- **date-fns** - Modern date manipulation
- **Recharts** - Data visualization

## 🏗️ Architecture

The project is split into two folders: a **Vite React frontend** and a **Node + Express + SQLite backend**.

```
photo-based-quality-assurance-system/
├── package.json                # Root: concurrently runs both apps
├── frontend/
│   ├── package.json
│   ├── vite.config.ts          # Proxies /api and /uploads to :4000
│   └── src/
│       ├── api/client.ts       # Typed fetch wrapper
│       ├── hooks/useBuildTrackData.ts
│       ├── components/
│       │   ├── ui/             # shadcn/ui primitives (incl. sonner,
│       │   │                   #   skeleton, tooltip, separator,
│       │   │                   #   scroll-area, sheet)
│       │   ├── Dashboard.tsx   # Stats, Gantt, recent activity
│       │   ├── TimelineView.tsx
│       │   ├── TaskView.tsx
│       │   ├── Navbar.tsx      # Sheet-based mobile drawer
│       │   ├── GanttChart.tsx
│       │   ├── TaskList.tsx
│       │   ├── TimelineFeed.tsx
│       │   └── PhotoUpload.tsx
│       ├── types/index.ts
│       ├── utils/cn.ts
│       ├── index.css           # Tailwind + design tokens
│       ├── main.tsx
│       └── App.tsx             # Wires API to views, mounts Toaster
└── backend/
    ├── package.json
    ├── data/                   # SQLite db (created at runtime)
    ├── uploads/                # Photo files (created at runtime)
    └── src/
        ├── server.ts           # Express app on :4000
        ├── db.ts               # better-sqlite3 + schema
        ├── seed.ts             # Seeds 8 demo tasks + 8 photos
        ├── types.ts            # Mirrors frontend types
        ├── routes/tasks.ts     # GET/POST/PATCH /api/tasks
        ├── routes/photos.ts    # GET/POST /api/photos (multer)
        └── middleware/error.ts # Centralized error handler
```

## 🚀 Getting Started

### One-shot install (root + frontend + backend)

```bash
npm install                # installs `concurrently` at root
npm run install:all        # installs frontend + backend deps
```

### Run both servers

```bash
npm run dev
```

This boots the backend on `http://localhost:4000` and the frontend on `http://localhost:5173`. The backend creates `backend/data/app.db` on first run and seeds it with 8 tasks and 8 photos.

### Run individually

```bash
npm run dev:backend
npm run dev:frontend
```

### Build the frontend bundle

```bash
npm run build
```

### API endpoints

| Method | Path | Purpose |
|---|---|---|
| GET    | `/api/health`     | Health probe |
| GET    | `/api/tasks`      | List tasks |
| POST   | `/api/tasks`      | Create task |
| PATCH  | `/api/tasks/:id`  | Update progress/status |
| GET    | `/api/photos`     | List photos (newest first) |
| POST   | `/api/photos`     | Upload photo (multipart, fields: `file`, `taskId`) |
| GET    | `/uploads/:file`  | Static photo files |

## 🎨 shadcn/ui Components Used

- **Card / Button / Badge / Progress / Dialog / Select / Table / Avatar / Input / Alert / Tabs** - Original primitives
- **Sonner** - Toast notifications for upload success/failure
- **Skeleton** - Loading placeholders during initial fetch
- **Tooltip** - Hover hints on nav, stat-cards, and photo avatars
- **Separator** - Section dividers and timeline date markers
- **ScrollArea** - Consistent scrollbars for the timeline feed and task tables
- **Sheet** - Mobile navigation drawer (collapses tabs under `md:`)

## 📊 Demo Data

The application comes pre-seeded with:

- **8 Tasks** across 5 categories (Foundation, Structure, Exterior, MEP, Interior)
- **8 Photos** with timestamps spanning a month
- **Partial Progress** (0-100%) to simulate real project state
- **Mixed Statuses** (completed, in-progress, not started)

## 💡 How to Demo

1. **Open Dashboard**: See real-time stats in beautiful cards
2. **Click "Upload Photo"**: Opens shadcn Dialog modal
3. **Select an Image**: Drag & drop or click to upload
4. **Choose a Task**: Select from dropdown (or let auto-detection help)
5. **Click "Upload & Update"**: 
   - Task progress +20% automatically
   - Status may change (Not Started → In Progress → Completed)
   - Gantt chart updates with animation
   - New entry appears in timeline with timestamps
6. **Navigate Views**: Use navbar tabs to explore Timeline and Task views

## 🎨 Design System

### Color Palette
- **Primary** - Violet/Indigo gradient for actions and branding
- **Success** - Emerald for completed items
- **Warning** - Amber for in-progress items
- **Destructive** - Rose for delayed/overdue items
- **Muted** - Slate for secondary information

### Category Colors
- 🔵 Foundation - Blue
- 🟣 Structure - Purple
- 🟠 Exterior - Orange
- 🩵 MEP - Cyan
- 🩷 Interior - Pink

### Status Indicators
- 🟢 Completed - Green badge
- 🟡 In Progress - Amber badge
- 🔴 Delayed/Overdue - Rose badge
- ⚪ Not Started - Gray outline badge

## 🎬 Feature Highlights

### Smart Upload Detection
The system analyzes filenames for keywords like:
- `site`, `clear`, `prepare` → Site Preparation
- `foundation`, `concrete` → Foundation Pour
- `steel`, `structure` → Steel Structure
- `roof`, `roofing` → Roofing Installation
- `electrical`, `wire` → Electrical Rough-In
- `plumbing`, `pipe` → Plumbing Installation

### UI Components
- **Cards** with subtle shadows and borders
- **Avatars** for photo thumbnails and user images
- **Badges** with proper color variants
- **Progress bars** with smooth animations
- **Dialogs** for the upload modal
- **Tables** for detailed task views
- **Inputs** and **Selects** for form handling

## 🔜 Future Enhancements

### Backend (next iterations)
- Swap SQLite for PostgreSQL with Prisma or Drizzle for production
- Cloud storage (S3 / Cloudinary) instead of the local `uploads/` folder
- Auth (sessions or JWT) and per-user task scoping
- Real-time updates via WebSockets / SSE so multiple clients see new uploads instantly

### AI Features
- Image recognition for automatic task tagging
- Progress estimation from photos
- Anomaly detection (missing work, quality issues)
- Smart scheduling based on photo data

### Advanced Features
- Multi-user support with permissions
- PDF report generation
- Email notifications
- Mobile responsive app
- AR photo overlay
- Drone integration

## 📝 License

This is a demo project for stakeholder presentation purposes.

## 🤝 Contributing

This is a demonstration project designed to showcase the concept of photo-based quality assurance for construction projects. Built with modern web technologies and beautiful UI components.

---

**Built with ❤️ using React, Vite, Tailwind CSS, and shadcn/ui**