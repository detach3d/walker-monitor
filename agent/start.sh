#!/bin/bash
# Agent startup script

# Check if virtual environment exists, create if not
if [ ! -d "agent/venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv agent/venv || {
        echo "Failed to create venv. Installing dependencies with --user flag..."
        pip3 install --user -r agent/requirements.txt
        python3 agent/agent.py
        exit $?
    }
    agent/venv/bin/pip install -r agent/requirements.txt
fi

# Activate and run
echo "Starting Walker Monitor Agent..."
agent/venv/bin/python agent/agent.py
