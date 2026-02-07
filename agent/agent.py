#!/usr/bin/env python3
"""
Walker Monitor Agent

Runs on each monitored host to execute walker commands and provide REST API.
"""
import subprocess
import re
import json
from datetime import datetime
from flask import Flask, jsonify, request
from flask_cors import CORS
import config

app = Flask(__name__)
CORS(app)

# Cache for last snapshot
_last_snapshot = None
_last_snapshot_time = None


def execute_walker(mode_flag):
    """Execute walker binary with specified mode flag"""
    try:
        result = subprocess.run(
            [config.WALKER_BINARY, mode_flag],
            capture_output=True,
            text=True,
            timeout=10
        )
        if result.returncode != 0:
            return None, f"Walker execution failed: {result.stderr}"

        # Extract the output after "Message by ioctl:\n"
        output = result.stdout
        if "Message by ioctl:\n" in output:
            output = output.split("Message by ioctl:\n", 1)[1]

        return output.strip(), None
    except subprocess.TimeoutExpired:
        return None, "Walker command timed out"
    except FileNotFoundError:
        return None, f"Walker binary not found at {config.WALKER_BINARY}"
    except Exception as e:
        return None, f"Error executing walker: {str(e)}"


def execute_ps_command():
    """Execute Linux ps command to get process and thread information"""
    try:
        # Use ps -eT to show threads, with custom format
        result = subprocess.run(
            ['ps', '-eT', '-o', 'pid,tid,comm'],
            capture_output=True,
            text=True,
            timeout=10
        )
        if result.returncode != 0:
            return None, f"PS command failed: {result.stderr}"

        return result.stdout.strip(), None
    except subprocess.TimeoutExpired:
        return None, "PS command timed out"
    except FileNotFoundError:
        return None, "PS command not found"
    except Exception as e:
        return None, f"Error executing ps: {str(e)}"


def parse_process_snapshot(raw_output):
    """
    Parse walker -p output into structured JSON
    
    Format:
    PID: 123 | Comm: processname
      PARENT PID: 456 | Comm: parentname
      CHILD PID: 789 | Comm: childname
    """
    processes = []
    current_process = None
    
    for line in raw_output.split('\n'):
        if not line.strip():
            continue
        
        # Match process line: PID: 123 | Comm: name
        proc_match = re.match(r'^PID: (\d+) \| Comm: (.+)$', line)
        if proc_match:
            if current_process:
                processes.append(current_process)
            current_process = {
                'pid': int(proc_match.group(1)),
                'comm': proc_match.group(2),
                'parents': [],
                'children': []
            }
            continue
        
        # Match parent line: PARENT PID: 123 | Comm: name
        parent_match = re.match(r'^\s+PARENT PID: (\d+) \| Comm: (.+)$', line)
        if parent_match and current_process:
            current_process['parents'].append({
                'pid': int(parent_match.group(1)),
                'comm': parent_match.group(2)
            })
            continue
        
        # Match child line: CHILD PID: 123 | Comm: name
        child_match = re.match(r'^\s+CHILD PID: (\d+) \| Comm: (.+)$', line)
        if child_match and current_process:
            current_process['children'].append({
                'pid': int(child_match.group(1)),
                'comm': child_match.group(2)
            })
            continue
    
    # Add last process
    if current_process:
        processes.append(current_process)
    
    return processes


def parse_thread_snapshot(raw_output):
    """
    Parse walker -t output into structured JSON

    Format:
    PID: 123 | Comm: processname
        THREAD: 123 | Comm: threadname
        THREAD: 124 | Comm: threadname2
    """
    processes = []
    current_process = None

    for line in raw_output.split('\n'):
        if not line.strip():
            continue

        # Match process line
        proc_match = re.match(r'^PID: (\d+) \| Comm: (.+)$', line)
        if proc_match:
            if current_process:
                processes.append(current_process)
            current_process = {
                'pid': int(proc_match.group(1)),
                'comm': proc_match.group(2),
                'threads': []
            }
            continue

        # Match thread line
        thread_match = re.match(r'^\s+THREAD: (\d+) \| Comm: (.+)$', line)
        if thread_match and current_process:
            current_process['threads'].append({
                'tid': int(thread_match.group(1)),
                'comm': thread_match.group(2)
            })

    # Add last process
    if current_process:
        processes.append(current_process)

    return processes


def parse_ps_output(raw_output):
    """
    Parse ps -eT output into structured JSON

    Format:
      PID   TID COMMAND
        1     1 systemd
      123   123 bash
      456   456 python
      456   457 python
    """
    lines = raw_output.split('\n')
    process_map = {}

    for line in lines[1:]:  # Skip header line
        if not line.strip():
            continue

        # Parse columns (PID, TID, COMM)
        parts = line.split(None, 2)  # Split on whitespace, max 3 parts
        if len(parts) < 3:
            continue

        try:
            pid = int(parts[0])
            tid = int(parts[1])
            comm = parts[2]

            # Group threads by PID
            if pid not in process_map:
                process_map[pid] = {
                    'pid': pid,
                    'comm': comm,
                    'threads': []
                }

            process_map[pid]['threads'].append({
                'tid': tid,
                'comm': comm
            })
        except (ValueError, IndexError):
            continue

    # Convert to list
    processes = list(process_map.values())
    return processes


def parse_fdt_snapshot(raw_output):
    """
    Parse walker -f output into structured JSON
    
    Format:
    PID: 123 | Comm: processname
    FILE PATH: File path for 0: /path/to/file
    File path for 1: /another/path
    
    or:
    
    PID: 123 | Comm: processname
    FILE PATH: No files for this process
    """
    processes = []
    current_process = None
    
    for line in raw_output.split('\n'):
        if not line.strip():
            continue
        
        # Match process line
        proc_match = re.match(r'^PID: (\d+) \| Comm: (.+)$', line)
        if proc_match:
            if current_process:
                processes.append(current_process)
            current_process = {
                'pid': int(proc_match.group(1)),
                'comm': proc_match.group(2),
                'fds': []
            }
            continue
        
        # Match FILE PATH: header (skip it)
        if line.startswith('FILE PATH:'):
            file_path_content = line.replace('FILE PATH:', '').strip()
            if file_path_content == 'No files for this process':
                # No files, keep fds empty
                continue
            else:
                # This line contains the first FD entry
                fd_match = re.match(r'File path for (\d+): (.+)$', file_path_content)
                if fd_match and current_process:
                    current_process['fds'].append({
                        'fd': int(fd_match.group(1)),
                        'path': fd_match.group(2)
                    })
            continue
        
        # Match individual FD lines (without FILE PATH: prefix)
        fd_match = re.match(r'^File path for (\d+): (.+)$', line)
        if fd_match and current_process:
            current_process['fds'].append({
                'fd': int(fd_match.group(1)),
                'path': fd_match.group(2)
            })
    
    # Add last process
    if current_process:
        processes.append(current_process)
    
    return processes


def parse_cpu_snapshot(raw_output):
    """
    Parse walker -c output into structured JSON
    
    Format (multi-line per process):
    PID: 1 | COMM: systemd
    CURRENT CPU: 1
    USER TIME: 501462 nanosec | SYSTEM TIME: 555768 nanosec | TOTAL TIME: 1057230 nanosec
    NICE: 0 | CURRENT PRIORITY: 120 | BASE PRIORITY: 120 | POLICY: normal
    CPU usage: 12%
    """
    processes = []
    lines = raw_output.split('\n')
    i = 0
    
    while i < len(lines):
        line = lines[i].strip()
        if not line:
            i += 1
            continue
        
        # Match PID line
        proc_match = re.match(r'^PID: (\d+) \| COMM: (.+)$', line)
        if proc_match:
            process = {
                'pid': int(proc_match.group(1)),
                'comm': proc_match.group(2)
            }
            
            # Next lines should be CPU, TIME, NICE/PRIORITY/POLICY,
            # and optionally CPU usage for newer driver output.
            if i + 3 < len(lines):
                # CPU line
                cpu_line = lines[i + 1].strip()
                cpu_match = re.match(r'^CURRENT CPU: (\d+)$', cpu_line)
                if cpu_match:
                    process['cpu'] = int(cpu_match.group(1))
                
                # TIME line
                time_line = lines[i + 2].strip()
                time_match = re.match(
                    r'^USER TIME: (\d+) nanosec \| SYSTEM TIME: (\d+) nanosec \| TOTAL TIME: (\d+) nanosec$',
                    time_line
                )
                if time_match:
                    process['user_time_ns'] = int(time_match.group(1))
                    process['system_time_ns'] = int(time_match.group(2))
                    process['total_time_ns'] = int(time_match.group(3))
                
                # NICE/PRIORITY/POLICY line
                nice_line = lines[i + 3].strip()
                nice_match = re.match(
                    r'^NICE: (-?\d+) \| CURRENT PRIORITY: (\d+) \| BASE PRIORITY: (\d+) \| POLICY: (.+)$',
                    nice_line
                )
                if nice_match:
                    process['nice'] = int(nice_match.group(1))
                    process['current_priority'] = int(nice_match.group(2))
                    process['base_priority'] = int(nice_match.group(3))
                    process['policy'] = nice_match.group(4)

                # Optional CPU usage line for backward compatibility
                step = 4
                if i + 4 < len(lines):
                    usage_line = lines[i + 4].strip()
                    usage_match = re.match(r'^CPU usage:\s*(\d+)%$', usage_line)
                    if usage_match:
                        process['cpu_usage'] = int(usage_match.group(1))
                        step = 5

                processes.append(process)
                i += step
            else:
                i += 1
        else:
            i += 1
    
    return processes


def parse_socket_snapshot(raw_output):
    """
    Parse walker -s output into structured JSON

    Format:
    PID: 123 | Comm: processname
    SOCKET INFO: File desc 4: 127.0.0.1:8080 -> 0.0.0.0:0
    File desc 7: [::1]:5000 -> [::]:0
    """
    def parse_endpoint(endpoint):
        endpoint = endpoint.strip()

        ipv6_match = re.match(r'^\[(.+)\]:(\d+)$', endpoint)
        if ipv6_match:
            return ipv6_match.group(1), int(ipv6_match.group(2)), 'IPv6'

        ipv4_match = re.match(r'^(.+):(\d+)$', endpoint)
        if ipv4_match:
            return ipv4_match.group(1), int(ipv4_match.group(2)), 'IPv4'

        return endpoint, None, 'Unknown'

    def parse_socket_line(line):
        socket_match = re.match(r'^File desc (\d+): (.+)$', line.strip())
        if not socket_match:
            return None

        fd = int(socket_match.group(1))
        mapping = socket_match.group(2)
        endpoints = mapping.split(' -> ', 1)
        if len(endpoints) != 2:
            return None

        local_raw, remote_raw = endpoints[0].strip(), endpoints[1].strip()
        local_addr, local_port, local_family = parse_endpoint(local_raw)
        remote_addr, remote_port, remote_family = parse_endpoint(remote_raw)

        family = local_family if local_family == remote_family else 'Mixed'
        socket_state = 'listening' if remote_port == 0 else 'connected'

        return {
            'fd': fd,
            'local': local_raw,
            'remote': remote_raw,
            'local_address': local_addr,
            'local_port': local_port,
            'remote_address': remote_addr,
            'remote_port': remote_port,
            'family': family,
            'state': socket_state
        }

    processes = []
    current_process = None
    current_socket_keys = set()
    lines = raw_output.split('\n')
    i = 0

    while i < len(lines):
        line = lines[i].rstrip()
        if not line.strip():
            i += 1
            continue

        proc_match = re.match(r'^PID: (\d+) \| Comm: (.+)$', line)
        if proc_match:
            if current_process:
                processes.append(current_process)
            current_process = {
                'pid': int(proc_match.group(1)),
                'comm': proc_match.group(2),
                'sockets': []
            }
            current_socket_keys = set()
            i += 1
            continue

        if line.startswith('SOCKET INFO:') and current_process:
            first_socket_line = line.replace('SOCKET INFO:', '', 1).strip()
            if first_socket_line:
                parsed = parse_socket_line(first_socket_line)
                if parsed:
                    key = (
                        parsed['fd'],
                        parsed['local'],
                        parsed['remote'],
                        parsed['family'],
                        parsed['state']
                    )
                    if key not in current_socket_keys:
                        current_socket_keys.add(key)
                        current_process['sockets'].append(parsed)

            i += 1
            while i < len(lines):
                next_line = lines[i].rstrip()
                if next_line.startswith('PID: '):
                    break
                if next_line.strip():
                    parsed = parse_socket_line(next_line)
                    if parsed:
                        key = (
                            parsed['fd'],
                            parsed['local'],
                            parsed['remote'],
                            parsed['family'],
                            parsed['state']
                        )
                        if key not in current_socket_keys:
                            current_socket_keys.add(key)
                            current_process['sockets'].append(parsed)
                i += 1
            continue

        i += 1

    if current_process:
        processes.append(current_process)

    return processes


@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint"""
    return jsonify({
        'status': 'online',
        'hostname': config.HOSTNAME,
        'timestamp': datetime.utcnow().isoformat() + 'Z'
    })


@app.route('/snapshot', methods=['GET'])
def snapshot():
    """Get process snapshot (walker -t parsed to JSON)"""
    global _last_snapshot, _last_snapshot_time

    # Use cached snapshot if available
    if _last_snapshot and _last_snapshot_time:
        return jsonify({
            'hostname': config.HOSTNAME,
            'timestamp': _last_snapshot_time,
            'processes': _last_snapshot
        })

    # Otherwise fetch fresh
    return refresh_snapshot()


@app.route('/refresh', methods=['GET'])
def refresh_snapshot():
    """Trigger fresh snapshot and return it"""
    global _last_snapshot, _last_snapshot_time

    raw_output, error = execute_walker('-t')
    if error:
        return jsonify({'error': error}), 500

    processes = parse_thread_snapshot(raw_output)
    timestamp = datetime.utcnow().isoformat() + 'Z'

    # Update cache
    _last_snapshot = processes
    _last_snapshot_time = timestamp

    return jsonify({
        'hostname': config.HOSTNAME,
        'timestamp': timestamp,
        'processes': processes
    })


@app.route('/ps', methods=['GET'])
def ps_snapshot():
    """Get process/thread list from Linux ps command"""
    raw_output, error = execute_ps_command()
    if error:
        return jsonify({'error': error}), 500

    processes = parse_ps_output(raw_output)

    return jsonify({
        'hostname': config.HOSTNAME,
        'timestamp': datetime.utcnow().isoformat() + 'Z',
        'processes': processes
    })


@app.route('/fdt', methods=['GET'])
def fdt_snapshot():
    """Get file descriptor table (walker -f parsed to JSON)"""
    raw_output, error = execute_walker('-f')
    if error:
        return jsonify({'error': error}), 500
    
    processes = parse_fdt_snapshot(raw_output)
    
    return jsonify({
        'hostname': config.HOSTNAME,
        'timestamp': datetime.utcnow().isoformat() + 'Z',
        'processes': processes
    })


@app.route('/cpu', methods=['GET'])
def cpu_snapshot():
    """Get CPU info (walker -c parsed to JSON)"""
    raw_output, error = execute_walker('-c')
    if error:
        return jsonify({'error': error}), 500
    
    processes = parse_cpu_snapshot(raw_output)
    
    return jsonify({
        'hostname': config.HOSTNAME,
        'timestamp': datetime.utcnow().isoformat() + 'Z',
        'processes': processes
    })


@app.route('/network', methods=['GET'])
def network_snapshot():
    """Get socket info (walker -s parsed to JSON)"""
    raw_output, error = execute_walker('-s')
    if error:
        return jsonify({'error': error}), 500

    processes = parse_socket_snapshot(raw_output)

    return jsonify({
        'hostname': config.HOSTNAME,
        'timestamp': datetime.utcnow().isoformat() + 'Z',
        'processes': processes
    })


@app.route('/tree', methods=['GET'])
def tree_snapshot():
    """Get process tree with parents and children (walker -p parsed to JSON)"""
    raw_output, error = execute_walker('-p')
    if error:
        return jsonify({'error': error}), 500

    processes = parse_process_snapshot(raw_output)

    return jsonify({
        'hostname': config.HOSTNAME,
        'timestamp': datetime.utcnow().isoformat() + 'Z',
        'processes': processes
    })


@app.route('/tree/<int:pid>', methods=['GET'])
def tree_for_pid(pid):
    """Get process tree data for a specific PID"""
    raw_output, error = execute_walker('-p')
    if error:
        return jsonify({'error': error}), 500

    processes = parse_process_snapshot(raw_output)

    # Find the specific process
    for proc in processes:
        if proc['pid'] == pid:
            return jsonify({
                'hostname': config.HOSTNAME,
                'timestamp': datetime.utcnow().isoformat() + 'Z',
                'process': proc
            })

    return jsonify({'error': f'Process {pid} not found'}), 404


@app.route('/raw', methods=['GET'])
def raw_output():
    """Get raw walker -p output for debugging"""
    raw_output, error = execute_walker('-p')
    if error:
        return jsonify({'error': error}), 500

    return jsonify({
        'hostname': config.HOSTNAME,
        'timestamp': datetime.utcnow().isoformat() + 'Z',
        'raw_output': raw_output
    })


if __name__ == '__main__':
    print(f"Starting Walker Monitor Agent on {config.HOSTNAME}:{config.AGENT_PORT}")
    print(f"Walker binary: {config.WALKER_BINARY}")
    app.run(host='0.0.0.0', port=config.AGENT_PORT, debug=True)
