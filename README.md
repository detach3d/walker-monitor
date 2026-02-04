# Walker Monitor

A modern web-based monitoring system for visualizing kernel process data from multiple hosts running the Walker kernel driver. Features a centralized server-agent architecture with a sleek dark-themed dashboard.

![Walker Monitor](https://img.shields.io/badge/status-active-success) ![License](https://img.shields.io/badge/license-GPL--2.0-blue)

## ✨ Features

- **Multi-Host Monitoring** - Manage and monitor multiple hosts from a single dashboard
- **Process Comparison** - Side-by-side comparison of walker snapshot vs ps output
- **Process Tree Visualization** - Interactive parent/child process relationships
- **File Descriptor Tracking** - Browse open file descriptors per process
- **CPU Metrics** - Detailed CPU usage, priority, and scheduling policy information
- **Real-Time Updates** - Manual refresh with timestamp tracking
- **Modern UI** - Dark theme with black/green color scheme, glassmorphism effects, and smooth animations
- **Global Search** - Filter processes by PID or command name across all views

## 🏗️ Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Host 1        │     │   Host 2        │     │   Host N        │
│                 │     │                 │     │                 │
│ Walker Driver   │     │ Walker Driver   │     │ Walker Driver   │
│       ↓         │     │       ↓         │     │       ↓         │
│  Agent :5000    │────▶│  Agent :5000    │────▶│  Agent :5000    │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                                   │
                                   ↓
                        ┌─────────────────────┐
                        │  Central Server     │
                        │    :3000            │
                        │                     │
                        │  ┌───────────────┐  │
                        │  │   Web UI      │  │
                        │  │  (React/Vite) │  │
                        │  └───────────────┘  │
                        └─────────────────────┘
                                   ↑
                        ┌──────────┴──────────┐
                        │    User Browser     │
                        └─────────────────────┘
```

### Components

1. **Agent** (Python/Flask) - Runs on each monitored host
   - Executes walker binary commands
   - Parses kernel driver output to JSON
   - Provides REST API on port 5000

2. **Server** (Node.js/Express) - Centralized aggregator
   - Manages host registry
   - Proxies data from agents
   - Health monitoring
   - Serves web UI on port 3000

3. **Web UI** (React/Vite) - Modern dashboard
   - Process comparison view
   - File descriptor browser
   - CPU metrics table
   - Host management

## 📋 Prerequisites

### For All Components

- **Linux OS** (kernel 4.x or later)
- **Walker kernel driver** loaded and accessible at `/dev/task_walker`
- **Git** (for cloning)

### For Agent

- **Python 3.7+**
- **pip3** or **python3-venv**
- Walker binary compiled (in `system/walker`)

### For Server & Web UI

- **Node.js 18.x+** (v20+ recommended)
- **npm 9.x+**

## 🚀 Quick Start

### 1. Walker Driver Setup

First, ensure the walker kernel driver is loaded:

```bash
cd system
sudo ./load.sh
```

Verify the device exists:

```bash
ls -la /dev/task_walker
```

Test the walker binary:

```bash
./system/walker -p | head -20
```

### 2. Agent Setup (On Each Monitored Host)

The agent must run on every host you want to monitor.

#### Install Python Dependencies

**Option A: Using virtual environment (recommended)**

```bash
cd agent

# Create virtual environment
python3 -m venv venv

# Activate it
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt
```

**Option B: Using the startup script**

The startup script will automatically handle virtual environment creation:

```bash
cd agent
./start.sh
```

#### Start the Agent

**If using virtual environment:**

```bash
cd agent
source venv/bin/activate
python agent.py
```

**If using startup script:**

```bash
cd agent
./start.sh
```

The agent will start on **port 5000** by default.

#### Verify Agent is Running

```bash
# From the same host
curl http://localhost:5000/health

# From another host
curl http://<agent-host-ip>:5000/health
```

Expected response:
```json
{
  "status": "online",
  "hostname": "your-hostname",
  "timestamp": "2026-02-02T21:45:00.000Z"
}
```

### 3. Server Setup (On Central Management Host)

#### Install Node.js Dependencies

```bash
cd server
npm install
```

#### Start the Server

```bash
npm start
```

The server will start on **port 3000** by default.

Server output:
```
Walker Monitor Server running on http://localhost:3000
API available at http://localhost:3000/api
```

### 4. Web UI Setup

#### Install Web Dependencies

```bash
cd web
npm install
```

#### Development Mode

```bash
npm run dev
```

The web UI will be available at **http://localhost:5173**

#### Production Build

```bash
npm run build
```

The built files will be in `web/dist/` and will be served by the server at **http://localhost:3000**

## 🔗 Connecting Hosts

Once the server and web UI are running:

1. **Open the Dashboard**
   - Navigate to `http://localhost:5173` (dev) or `http://localhost:3000` (production)

2. **Add a Host**
   - Click the **"Add Host"** button in the top bar
   - Fill in the form:
     - **Host Name**: A friendly name (e.g., "production-server-01")
     - **Agent URL**: The agent's URL (e.g., `http://192.168.1.100:5000`)
     - **API Key**: (Optional) If you configured authentication
   - Click **"Add Host"**

3. **Select a Host**
   - Use the dropdown in the top bar to select your host
   - The status indicator will show if the host is online

4. **Refresh Data**
   - Click the refresh button (🔄) to load fresh data
   - Data is automatically cached for quick subsequent views

## 📖 Usage Guide

### Process View

**Two-Column Comparison:**
- **Left**: Walker snapshot (source of truth)
- **Right**: PS output (for comparison)

**Features:**
- Click process rows to expand and view threads
- Toggle **"Show differences only"** to highlight discrepancies
- Click tree icon (🌿) to view process parent/child relationships
- Search by PID or command name

**Process Tree Modal:**
- Shows full parent chain (oldest to current)
- Lists direct children (filters out walker/ps commands)
- Highlighted selected process

### File Descriptors View

- Lists all processes with their open file descriptors
- Click process to expand and see FD details
- Shows FD number and resolved file path
- Badge indicates FD count per process  

### CPU View

**Sortable Table Columns:**
- PID, Command, CPU Core
- User/System/Total Time (formatted)
- Nice value
- Current/Base Priority
- Scheduling Policy

Click column headers to sort ascending/descending.

### Host Management

**Host Info:**
- Click info button (ℹ️) to view host details
- Shows connection status, last seen, reported hostname
- Remove host option available

**Health Monitoring:**
- Automatic health checks every 30 seconds
- Status indicator shows online/offline
- Server logs health check results

## 🛠️ Configuration

### Agent Configuration

Edit `agent/config.py`:

```python
# Walker binary path
WALKER_BINARY = '/path/to/walker'

# Agent port
AGENT_PORT = 5000

# Optional API key
API_KEY = os.getenv('AGENT_API_KEY', None)
```

Set API key via environment:

```bash
export AGENT_API_KEY="your-secret-key"
python agent.py
```

### Server Configuration

Edit `server/server.js` or use environment variables:

```bash
export PORT=3000
node server.js
```

### Web UI Configuration

Edit `web/vite.config.js` to change proxy settings:

```javascript
proxy: {
  '/api': {
    target: 'http://localhost:3000',
    changeOrigin: true
  }
}
```

## 🧪 Testing

### Test Agent Endpoints

```bash
# Health check
curl http://localhost:5000/health

# Process snapshot
curl http://localhost:5000/snapshot | jq

# Thread list
curl http://localhost:5000/ps | jq

# File descriptors
curl http://localhost:5000/fdt | jq

# CPU info
curl http://localhost:5000/cpu | jq

# Raw walker output
curl http://localhost:5000/raw | jq
```

### Test Server API

```bash
# List hosts
curl http://localhost:3000/api/hosts

# Add host
curl -X POST http://localhost:3000/api/hosts \
  -H "Content-Type: application/json" \
  -d '{"name":"test-host","url":"http://localhost:5000"}'

# Get host snapshot
curl http://localhost:3000/api/hosts/test-host/snapshot
```

## 🐛 Troubleshooting

### Walker Device Not Found

**Error:** `Can't open device file: /dev/task_walker`

**Solution:**
```bash
cd system
sudo ./load.sh
ls -la /dev/task_walker
```

### Python Virtual Environment Issues

**Error:** `The virtual environment was not created successfully because ensurepip is not available`

**Solution:**
```bash
sudo apt install python3-venv python3-pip
```

### Agent Connection Failed

**Error:** `Host shows as offline`

**Checklist:**
1. Verify agent is running: `ps aux | grep agent.py`
2. Check port accessibility: `telnet <agent-ip> 5000`
3. Check firewall rules: `sudo ufw status`
4. Verify walker binary path in config.py
5. Check agent logs for errors

### Node.js Version Issues

**Error:** `npm WARN EBADENGINE Unsupported engine`

**Solution:**
```bash
# Install Node.js 20+
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
```

### Web UI Not Loading Data

**Checklist:**
1. Verify server is running on port 3000
2. Check browser console for errors (F12)
3. Verify Vite proxy configuration
4. Ensure host is added and selected
5. Click refresh button to load data

## 📁 Project Structure

```
walker-monitor/
├── system/                 # Walker kernel driver & binary
│   ├── task_walker.c       # Kernel driver source
│   ├── task_walker.h       # Driver header
│   ├── walker.c            # Userspace tool
│   ├── walker              # Compiled binary
│   ├── Makefile            # Build configuration
│   ├── load.sh             # Load driver script
│   └── unload.sh           # Unload driver script
│
├── agent/                  # Python agent (runs on hosts)
│   ├── agent.py            # Flask server & walker executor
│   ├── config.py           # Configuration
│   ├── requirements.txt    # Python dependencies
│   └── start.sh            # Startup script
│
├── server/                 # Node.js server (central)
│   ├── server.js           # Express API server
│   └── package.json        # Node dependencies
│
├── web/                    # React web UI
│   ├── src/
│   │   ├── api/           # API client
│   │   ├── components/    # React components
│   │   ├── views/         # Main views
│   │   ├── styles/        # CSS styles
│   │   ├── App.jsx        # Main app component
│   │   └── main.jsx       # Entry point
│   ├── index.html         # HTML template
│   ├── vite.config.js     # Vite configuration
│   └── package.json       # Web dependencies
│
└── README.md              # This file
```

## 🎨 Design Features

- **Color Scheme**: Dark theme with black (#0a0a0a) and matrix green (#00ff41) accents
- **Typography**: Inter font from Google Fonts
- **Visual Effects**: 
  - Glassmorphism on top bar
  - Smooth micro-animations (hover, transitions)
  - Green glow effects on interactive elements
  - Floating logo animation
- **Responsive**: Adapts to different screen sizes
- **Accessibility**: Semantic HTML, ARIA attributes, keyboard navigation

## 📝 Notes

- **No changes to system files**: The driver and walker binary remain untouched
- **In-memory storage**: Server uses in-memory host registry (does not persist across restarts)
- **Manual refresh**: Data is not auto-refreshed; user must click refresh button
- **Local timestamps**: Displayed in user's local timezone
- **Process tree filtering**: Children list automatically filters out walker/ps commands

## 📄 License

This project uses components with different licenses:

- **Walker Driver & System Components**: GPL-2.0 (as per original driver)
- **Agent, Server, Web UI**: MIT License

## 👨‍💻 Author

Walker Monitor System created by Antigravity (Google DeepMind Advanced Agentic Coding)  
Original Walker Driver by Rasul Mammadov

## 🙏 Acknowledgments

- Walker kernel driver for providing process introspection capabilities
- React, Vite, Flask, Express communities for excellent frameworks
- Google Fonts for the Inter typeface
