# Walker Monitor - Quick Start

## Running System (Already Set Up)

All services are currently running:

- ✅ **Agent**: http://localhost:5000
- ✅ **Server**: http://localhost:3000/api
- ✅ **Web UI**: http://localhost:3000

**Access the dashboard:** Open http://localhost:3000 in your browser

The localhost agent is already registered. Click refresh to see live process data!

## Starting Fresh (After Reboot)

### Terminal 1 - Start Agent
```bash
cd /home/dev/linux/drivers/walker-monitor
agent/venv/bin/python agent/agent.py
```

### Terminal 2 - Start Server
```bash
cd /home/dev/linux/drivers/walker-monitor
node server/server.js
```

### Access
Open http://localhost:3000 in your browser

## Adding Remote Hosts

1. On each remote host, copy the `agent/` directory
2. Install dependencies: `python3 -m venv venv && venv/bin/pip install -r requirements.txt`
3. Start agent: `venv/bin/python agent.py`
4. In web UI: Click "Add Host", enter host details

## Test Commands

```bash
# Test agent
curl http://localhost:5000/health | jq

# Test server API
curl http://localhost:3000/api/hosts | jq

# Get process snapshot
curl http://localhost:3000/api/hosts/localhost/snapshot | jq '.processes | length'

# Get CPU data
curl http://localhost:3000/api/hosts/localhost/cpu | jq '.processes[0]'
```

## Current Status

```
✅ Walker driver loaded (/dev/task_walker)
✅ Python venv created with Flask
✅ Agent running on port 5000
✅ Server running on port 3000
✅ Web UI built and deployed
✅ Localhost registered and responding
✅ Tested: 228 processes detected
```

System is fully operational!
