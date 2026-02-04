"""
Agent configuration
"""
import os
import socket

# Walker binary path - relative to project root
WALKER_BINARY = os.path.join(os.path.dirname(__file__), '..', 'system', 'walker')

# Agent HTTP server port
AGENT_PORT = 5000

# Host identification
HOSTNAME = socket.gethostname()

# API settings
API_KEY = os.getenv('AGENT_API_KEY', None)  # Optional API key for authentication
