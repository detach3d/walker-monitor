export const FLAG_META = {
    deleted: {
        label: 'Deleted Binary',
        severity: 'critical',
        description: 'Executable was unlinked from disk while still running',
    },
    suspicious_path: {
        label: 'Suspicious Path',
        severity: 'high',
        description: 'Executable loaded from /tmp, /dev/shm, or memfd',
    },
    kthread_imposter: {
        label: 'Kernel Imposter',
        severity: 'critical',
        description: 'Process name mimics a kernel thread but has a userspace binary',
    },
    non_default_ns: {
        label: 'Non-default NS',
        severity: 'medium',
        description: 'Process is running in a non-default namespace (container or sandbox)',
    },
    privesc: {
        label: 'Privilege Escalation',
        severity: 'critical',
        description: 'Process running as root was spawned by a non-root parent',
    },
    suspicious_vma: {
        label: 'Suspicious VMA',
        severity: 'critical',
        description: 'Writable + executable memory region detected (potential shellcode injection)',
    },
    recently_started: {
        label: 'Recently Started',
        severity: 'low',
        description: 'Process started within the last 5 minutes',
    },
    kernel_thread: {
        label: 'Kernel Thread',
        severity: 'info',
        description: 'No executable path (expected for real kernel threads)',
    },
};

export const SEVERITY_ORDER = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3,
    info: 4,
};

const isKernelThreadOnly = (flags) =>
    flags.length > 0 && flags.every((flag) => flag === 'kernel_thread');

export const classifyAnomalyProcesses = (processes = []) => {
    const allProcesses = Array.isArray(processes) ? processes : [];

    const flaggedProcesses = allProcesses.filter((proc) => {
        const flags = Array.isArray(proc.flags) ? proc.flags : [];
        return flags.length > 0 && !isKernelThreadOnly(flags);
    });

    const cleanProcesses = allProcesses.filter((proc) => {
        const flags = Array.isArray(proc.flags) ? proc.flags : [];
        return flags.length === 0 || isKernelThreadOnly(flags);
    });

    return {
        allProcesses,
        flaggedProcesses,
        cleanProcesses,
    };
};
