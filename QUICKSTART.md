# Walker Monitor - Quick Start

This is a fast runbook. For full dependency installation, use `README.md`.

## 0) Prerequisites (already installed)

Make sure you already installed all dependencies from `README.md`:
- kernel headers/build tools
- Python + venv/pip
- Node.js 20+

## 1) Build and load walker (Terminal A)

```bash
cd /home/dev/linux/drivers/walker-monitor/system
make clean
make
gcc -Wall walker.c -o walker
sudo ./load.sh task_walker

# verify
ls -la /dev/task_walker
./walker -p | head -20
```

## 2) Start agent (Terminal B)

```bash
cd /home/dev/linux/drivers/walker-monitor/agent
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# Optional auth (recommended)
# export AGENT_API_KEY="change-me"

python agent.py
```

Agent defaults:
- host: `0.0.0.0`
- port: `5000`

## 3) Start server (Terminal C)

```bash
cd /home/dev/linux/drivers/walker-monitor/server
npm install
npm start
```

Server default: `http://localhost:3000`

## 4) Build web UI once (optional in production mode)

```bash
cd /home/dev/linux/drivers/walker-monitor/web
npm install
npm run build
```

## 5) Add host in UI

Open `http://localhost:3000`.

When adding a host:
- Host Name: any friendly name
- Agent URL: `http://<agent-ip>:5000`
- API Key: same value as `AGENT_API_KEY` (if you set one)

Important:
- Use a routable IP from the agent host.
- Do **not** use `localhost`/`127.0.0.1` (blocked by default).

Get agent IP:

```bash
hostname -I | awk '{print $1}'
```

## 6) Smoke tests

### Agent

```bash
# no auth
curl http://<agent-ip>:5000/health | jq

# with auth
curl -H "Authorization: Bearer $AGENT_API_KEY" http://<agent-ip>:5000/health | jq
```

### Server

```bash
curl http://localhost:3000/api/hosts | jq
curl http://localhost:3000/api/hosts/<host-name>/snapshot | jq '.processes | length'
```

## 7) Common issues

### `Can't open device file: /dev/task_walker`

```bash
cd /home/dev/linux/drivers/walker-monitor/system
sudo ./load.sh task_walker
```

### Agent `{"error":"Unauthorized"}`

Add bearer header:

```bash
curl -H "Authorization: Bearer $AGENT_API_KEY" http://<agent-ip>:5000/health
```

### Host stays offline in UI

- Verify server can reach `http://<agent-ip>:5000/health`
- Verify API key matches (if enabled)
- Verify host URL is not loopback
