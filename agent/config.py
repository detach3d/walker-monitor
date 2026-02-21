"""
Agent configuration
"""
import os
import socket


def _env_bool(name, default=False):
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


# Walker binary path - relative to project root
WALKER_BINARY = os.path.join(os.path.dirname(__file__), '..', 'system', 'walker')

# Agent HTTP server port
AGENT_PORT = int(os.getenv('AGENT_PORT', '5000'))
AGENT_HOST = os.getenv('AGENT_HOST', '0.0.0.0')
AGENT_DEBUG = _env_bool('AGENT_DEBUG', False)

# Host identification
HOSTNAME = socket.gethostname()

# API settings
API_KEY = os.getenv('AGENT_API_KEY', None)  # Optional API key for authentication
AUTH_REQUIRED = bool(API_KEY)
