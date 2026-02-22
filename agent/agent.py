#!/usr/bin/env python3
"""
Walker Monitor Agent

Runs on each monitored host to execute walker commands and provide REST API.
"""
import subprocess
import re
import hmac
from datetime import datetime
from flask import Flask, jsonify, request
from flask_cors import CORS
import config

app = Flask(__name__)
CORS(app)

# Cache for last snapshot
_last_snapshot = None
_last_snapshot_time = None


def _has_valid_api_key(req):
    """Validate Bearer token when AGENT_API_KEY is configured."""
    auth_header = req.headers.get('Authorization', '')
    bearer_prefix = 'Bearer '
    if not auth_header.startswith(bearer_prefix):
        return False

    provided_key = auth_header[len(bearer_prefix):].strip()
    if not provided_key:
        return False

    return hmac.compare_digest(provided_key, config.API_KEY)


@app.before_request
def enforce_api_key():
    """
    Enforce API-key auth for every request when AGENT_API_KEY is set.
    Allow unauthenticated OPTIONS preflight for CORS.
    """
    if request.method == 'OPTIONS' or not config.AUTH_REQUIRED:
        return None

    if _has_valid_api_key(request):
        return None

    return jsonify({'error': 'Unauthorized'}), 401


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


def parse_memory_snapshot(raw_output):
    """
    Parse walker -m output into structured JSON

    Format (two lines per process — userspace):
    PID: 1 | COMM: systemd
    STATE: S | VIRTUAL MEM: 21952 KB | RESIDENT MEM: 11892 KB | SHARED MEM: 8436 KB

    Format (two lines per process — kernel thread, no mm):
    PID: 2 | COMM: kthreadd
    STATE: I
    """
    processes = []
    lines = raw_output.split('\n')
    i = 0

    while i < len(lines):
        line = lines[i].strip()
        if not line:
            i += 1
            continue

        proc_match = re.match(r'^PID: (\d+) \| COMM: (.+)$', line)
        if proc_match:
            process = {
                'pid': int(proc_match.group(1)),
                'comm': proc_match.group(2)
            }

            if i + 1 < len(lines):
                mem_line = lines[i + 1].strip()
                # Full format with memory info
                mem_match = re.match(
                    r'^STATE: (\S+) \| VIRTUAL MEM: (\d+) KB \| RESIDENT MEM: (\d+) KB \| SHARED MEM: (\d+) KB$',
                    mem_line
                )
                if mem_match:
                    process['state'] = mem_match.group(1)
                    process['virtual_kb'] = int(mem_match.group(2))
                    process['resident_kb'] = int(mem_match.group(3))
                    process['shared_kb'] = int(mem_match.group(4))
                    processes.append(process)
                    i += 2
                    continue

                # State-only format (kernel threads with no mm)
                state_match = re.match(r'^STATE: (\S+)$', mem_line)
                if state_match:
                    process['state'] = state_match.group(1)
                    process['virtual_kb'] = 0
                    process['resident_kb'] = 0
                    process['shared_kb'] = 0
                    processes.append(process)
                    i += 2
                    continue

            i += 1
        else:
            i += 1

    return processes


def parse_socket_snapshot(raw_output):
    """
    Parse walker -s output into structured JSON

    New format from driver:
    PID: 123 | Comm: processname
    SOCKET INFO: FD 17: family=16 type=3 state=7
    FD 99: family=2 type=1 state=10 0.0.0.0:22 -> 0.0.0.0:0
    FD 100: family=10 type=1 state=10 [::]:22 -> [::]:0
    """
    FAMILY_NAMES = {
        1: 'AF_UNIX', 2: 'IPv4', 10: 'IPv6',
        16: 'AF_NETLINK', 17: 'AF_PACKET'
    }

    SOCK_TYPE_NAMES = {
        1: 'STREAM', 2: 'DGRAM', 3: 'RAW',
        5: 'SEQPACKET'
    }

    TCP_STATE_NAMES = {
        1: 'established', 2: 'syn_sent', 3: 'syn_recv',
        4: 'fin_wait1', 5: 'fin_wait2', 6: 'time_wait',
        7: 'close', 8: 'close_wait', 9: 'last_ack',
        10: 'listening', 11: 'closing'
    }

    def parse_endpoint(endpoint):
        endpoint = endpoint.strip()

        ipv6_match = re.match(r'^\[(.+)\]:(\d+)$', endpoint)
        if ipv6_match:
            return ipv6_match.group(1), int(ipv6_match.group(2))

        ipv4_match = re.match(r'^(.+):(\d+)$', endpoint)
        if ipv4_match:
            return ipv4_match.group(1), int(ipv4_match.group(2))

        return endpoint, None

    def parse_socket_line(line):
        line = line.strip()

        # Match: FD <num>: family=<num> type=<num> state=<num> [addr -> addr]
        fd_match = re.match(
            r'^FD (\d+): family=(\d+) type=(\d+) state=(\d+)\s*(.*)$', line
        )
        if not fd_match:
            return None

        fd = int(fd_match.group(1))
        family_num = int(fd_match.group(2))
        sock_type_num = int(fd_match.group(3))
        state_num = int(fd_match.group(4))
        rest = (fd_match.group(5) or '').strip()

        family = FAMILY_NAMES.get(family_num, f'family={family_num}')
        sock_type = SOCK_TYPE_NAMES.get(sock_type_num, f'type={sock_type_num}')
        state = TCP_STATE_NAMES.get(state_num, f'state={state_num}')

        result = {
            'fd': fd,
            'family': family,
            'sock_type': sock_type,
            'state': state,
            'local': '-',
            'remote': '-',
            'local_address': '-',
            'local_port': None,
            'remote_address': '-',
            'remote_port': None,
        }

        # Parse address endpoints if present (IPv4/IPv6 sockets)
        if rest and ' -> ' in rest:
            endpoints = rest.split(' -> ', 1)
            local_raw = endpoints[0].strip()
            remote_raw = endpoints[1].strip()
            local_addr, local_port = parse_endpoint(local_raw)
            remote_addr, remote_port = parse_endpoint(remote_raw)

            result['local'] = local_raw
            result['remote'] = remote_raw
            result['local_address'] = local_addr
            result['local_port'] = local_port
            result['remote_address'] = remote_addr
            result['remote_port'] = remote_port

        return result

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
                    key = (parsed['fd'], parsed['family'], parsed['local'], parsed['remote'])
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
                        key = (parsed['fd'], parsed['family'], parsed['local'], parsed['remote'])
                        if key not in current_socket_keys:
                            current_socket_keys.add(key)
                            current_process['sockets'].append(parsed)
                i += 1
            continue

        i += 1

    if current_process:
        processes.append(current_process)

    return processes


def parse_anomalies_snapshot(raw_output):
    """
    Parse walker -a output into structured JSON

    Format:
    ******************   PID: 1 | Comm: systemd   ******************
        Thread info: 1 | Comm: systemd
            Executable path: /usr/lib/systemd/systemd

        Namespace info:
        mnt:[4026531841]
        ...
        depth: [0]

        Time info:
        start_time (ns since boot): 7000000
        computed start realtime: 1771691733.533547326

        Cmdline: /sbin/init
    """
    processes = []
    current_process = None
    current_thread = None
    in_namespace_block = False
    in_privesc_block = False
    in_time_block = False
    in_vma_block = False

    for line in raw_output.split('\n'):
        stripped = line.strip()
        if not stripped or stripped == '******************':
            continue

        # Match process line (with or without *** wrapper)
        proc_match = re.match(r'^(?:\*+\s+)?PID: (\d+) \| Comm: (.+?)(?:\s+\*+)?$', stripped)
        if proc_match:
            if current_thread and current_process:
                current_process['threads'].append(current_thread)
            if current_process:
                processes.append(current_process)
            current_process = {
                'pid': int(proc_match.group(1)),
                'comm': proc_match.group(2).strip(),
                'threads': [],
                'flags': [],
                'namespaces': {},
                'privesc': None,
                'start_time_ns': None,
                'start_realtime': None,
                'cmdline': None,
                'vmas': []
            }
            current_thread = None
            in_namespace_block = False
            in_privesc_block = False
            in_time_block = False
            in_vma_block = False
            continue

        # Match thread line
        thread_match = re.match(r'^Thread info: (\d+) \| Comm: (.+)$', stripped)
        if thread_match and current_process:
            if current_thread:
                current_process['threads'].append(current_thread)
            current_thread = {
                'tid': int(thread_match.group(1)),
                'comm': thread_match.group(2),
                'exe_path': None,
                'flags': []
            }
            in_namespace_block = False
            in_privesc_block = False
            continue

        # Match exe path line
        exe_match = re.match(r'^Executable path: (.+)$', stripped)
        if exe_match and current_thread:
            path = exe_match.group(1)
            current_thread['exe_path'] = path
            continue

        # Namespace info block
        if stripped == 'Namespace info:':
            # Finalize last thread before namespace block
            if current_thread and current_process:
                current_process['threads'].append(current_thread)
                current_thread = None
            in_namespace_block = True
            continue

        if in_namespace_block and current_process:
            # Match namespace lines: mnt:[4026531841], pid:[4026531836], etc.
            ns_match = re.match(r'^(\w+):\[(\d+)\]$', stripped)
            if ns_match:
                ns_name = ns_match.group(1)
                ns_inum = int(ns_match.group(2))
                current_process['namespaces'][ns_name] = ns_inum
                continue

            # Match depth line: depth: [0]
            depth_match = re.match(r'^depth: \[(\d+)\]$', stripped)
            if depth_match:
                current_process['namespaces']['depth'] = int(depth_match.group(1))
                in_namespace_block = False
                continue

        # PrivEsc info block (handles both "PrivEsc info:" and "Privesc info:")
        if stripped.lower() == 'privesc info:':
            in_privesc_block = True
            in_namespace_block = False
            continue

        if in_privesc_block and current_process:
            # Match "Is current process in the same user namespace as init?" line
            same_ns_match = re.match(
                r'^Is current process in the same user namespace as init\? (.+)$', stripped
            )
            if same_ns_match:
                current_process['privesc'] = current_process.get('privesc') or {}
                current_process['privesc']['same_user_ns'] = same_ns_match.group(1).strip() == 'yes'
                continue

            # Match parent line: Parent PID: 123 | Parent Comm: bash | Parent UID: 1000
            parent_match = re.match(
                r'^Parent PID: (\d+) \| Parent Comm: (.+?) \| Parent UID: (\d+)$', stripped
            )
            if parent_match:
                current_process['privesc'] = current_process.get('privesc') or {}
                current_process['privesc']['parent_pid'] = int(parent_match.group(1))
                current_process['privesc']['parent_comm'] = parent_match.group(2)
                current_process['privesc']['parent_uid'] = int(parent_match.group(3))
                continue

            # Match current line: Current PID: 456 | Current Comm: su | Current UID: 0
            current_match = re.match(
                r'^Current PID: (\d+) \| Current Comm: (.+?) \| Current UID: (\d+)$', stripped
            )
            if current_match:
                current_process['privesc'] = current_process.get('privesc') or {}
                current_process['privesc']['current_uid'] = int(current_match.group(3))
                in_privesc_block = False
                continue

            # Skip "Possible privilege escalation detected!" line
            if 'privilege escalation' in stripped.lower():
                continue

        # Time info block
        if stripped == 'Time info:':
            in_time_block = True
            in_namespace_block = False
            in_privesc_block = False
            continue

        if in_time_block and current_process:
            # Match start_time (ns since boot): 7000000
            boot_match = re.match(r'^start_time \(ns since boot\): (\d+)$', stripped)
            if boot_match:
                current_process['start_time_ns'] = int(boot_match.group(1))
                continue

            # Match computed start realtime: 1771691733.533547326
            real_match = re.match(r'^computed start realtime: (\d+\.\d+)$', stripped)
            if real_match:
                current_process['start_realtime'] = float(real_match.group(1))
                in_time_block = False
                continue

        # Cmdline
        cmdline_match = re.match(r'^Cmdline: (.*)$', stripped)
        if not cmdline_match:
            cmdline_match = re.match(r'^Command Line: (.*)$', stripped)
        if cmdline_match and current_process:
            cmdline = cmdline_match.group(1).strip()
            current_process['cmdline'] = cmdline if cmdline else None
            in_time_block = False
            in_privesc_block = False
            continue

        # VMA Info block
        if stripped == 'VMA Info:':
            in_vma_block = True
            in_time_block = False
            in_privesc_block = False
            in_namespace_block = False
            continue

        if in_vma_block and current_process:
            # Match VMA line: VMA <start>-<end> flags=0x<hex> <rwx> <shared/private> [file=<path>]
            vma_match = re.match(
                r'^VMA ([0-9a-f]+)-([0-9a-f]+) flags=0x([0-9a-f]+) ([r-])([w-])([x-]) (shared|private)(?:\s+file=(.+))?$',
                stripped
            )
            if vma_match:
                start = int(vma_match.group(1), 16)
                end = int(vma_match.group(2), 16)
                perms = vma_match.group(4) + vma_match.group(5) + vma_match.group(6)
                mapping = vma_match.group(7)
                file_path = vma_match.group(8)
                size_kb = (end - start) >> 10

                vma_entry = {
                    'start': vma_match.group(1),
                    'end': vma_match.group(2),
                    'perms': perms,
                    'mapping': mapping,
                    'size_kb': size_kb,
                    'file': file_path
                }
                current_process['vmas'].append(vma_entry)
                continue
            else:
                # Non-VMA line means end of VMA block
                in_vma_block = False
                # Don't continue — let it fall through to other parsers

    # Finalize last entries
    if current_thread and current_process:
        current_process['threads'].append(current_thread)
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


@app.route('/memory', methods=['GET'])
def memory_snapshot():
    """Get memory info (walker -m parsed to JSON)"""
    raw_output, error = execute_walker('-m')
    if error:
        return jsonify({'error': error}), 500

    processes = parse_memory_snapshot(raw_output)

    return jsonify({
        'hostname': config.HOSTNAME,
        'timestamp': datetime.utcnow().isoformat() + 'Z',
        'processes': processes
    })


@app.route('/anomalies', methods=['GET'])
def anomalies_snapshot():
    """Get anomalies info (walker -a parsed to JSON)"""
    raw_output, error = execute_walker('-a')
    if error:
        return jsonify({'error': error}), 500

    processes = parse_anomalies_snapshot(raw_output)

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
    print(
        f"Starting Walker Monitor Agent on "
        f"{config.HOSTNAME} ({config.AGENT_HOST}:{config.AGENT_PORT})"
    )
    print(f"Walker binary: {config.WALKER_BINARY}")
    print(f"API key auth: {'enabled' if config.AUTH_REQUIRED else 'disabled'}")
    print(f"Debug mode: {'enabled' if config.AGENT_DEBUG else 'disabled'}")
    app.run(host=config.AGENT_HOST, port=config.AGENT_PORT, debug=config.AGENT_DEBUG)
