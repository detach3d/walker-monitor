#ifndef TASK_WALKER_H_
#define TASK_WALKER_H_

#include <linux/stddef.h>
#include <linux/ioctl.h>

#define TASK_WALKER_MAGIC		't'
#define IOC_WALK_PROCS			_IO(TASK_WALKER_MAGIC, 1)
#define IOC_WALK_THREADS		_IO(TASK_WALKER_MAGIC, 2)
#define IOC_WALK_FDT            _IO(TASK_WALKER_MAGIC, 3)
#define IOC_WALK_CPU            _IO(TASK_WALKER_MAGIC, 4)
#define IOC_WALK_SOCK           _IO(TASK_WALKER_MAGIC, 5)
#define IOC_WALK_MEMORY         _IO(TASK_WALKER_MAGIC, 6)
#define IOC_WALK_ANOMALIES       _IO(TASK_WALKER_MAGIC, 7)
#define DEVICE_FILE_NAME        "/dev/task_walker"

/*
 * Scheduling policies from /linux/sched.h
 */
#define SCHED_NORMAL		0
#define SCHED_FIFO		    1
#define SCHED_RR		    2
#define SCHED_BATCH		    3
/* SCHED_ISO: reserved but not implemented yet */
#define SCHED_IDLE		    5
#define SCHED_DEADLINE		6
#define SCHED_EXT		    7

#endif
