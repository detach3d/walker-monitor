#include <linux/module.h>
#include <linux/kernel.h>
#include <linux/fs.h>
#include <linux/cdev.h>
#include <linux/net.h>
#include <net/sock.h>
#include <net/inet_sock.h>
#include <linux/ipv6.h>
#include <net/ipv6.h>
#include <linux/string.h>
#include <linux/uaccess.h>
#include <linux/dcache.h>
#include <linux/fdtable.h>
#include <linux/sched/cputime.h>
#include <linux/sched.h>
#include <linux/cpumask.h>
#include <linux/mutex.h>
#include <linux/file.h>
#include <linux/mm.h>
#include <linux/mnt_namespace.h>
#include <linux/utsname.h>
#include <linux/ipc_namespace.h>
#include <linux/nsproxy.h>
#include <linux/pid_namespace.h>
#include "task_walker.h"

MODULE_LICENSE("GPL");
MODULE_AUTHOR("Rasul Mammadov");
MODULE_DESCRIPTION("This driver walks through the task list of the kernel.");

static int device_open(struct inode *inode,
					   struct file *file);

static int device_release(struct inode *inode,
						  struct file *file);

static ssize_t proc_walker_write(struct file *file,
								 char __user *buffer,
								 size_t length,
								 loff_t *offset);

static ssize_t fdt_walker_write(struct file *file,
								char __user *buffer,
								size_t length,
								loff_t *offset);

static ssize_t thread_walker_write(struct file *file,
								   char __user *buffer,
								   size_t length,
								   loff_t *offset);

static ssize_t CPU_walker_write(struct file *file,
								char __user *buffer,
								size_t length,
								loff_t *offset);

static ssize_t sock_walker_write(struct file *file,
								 char __user *buffer,
								 size_t length,
								 loff_t *offset);

static ssize_t memory_walker_write(struct file *file,
								   char __user *buffer,
								   size_t length,
								   loff_t *offset);

static ssize_t anomalies_walker_write(struct file *file,
									  char __user *buffer,
									  size_t length,
									  loff_t *offset);

void get_vma_info(struct task_struct *task,
				  char *buf,
				  int buflen);

void get_exe_path(struct task_struct *task,
				  char *buf,
				  int buflen);

void get_file_path_current(struct task_struct *task,
						   char *buf,
						   int buflen);

void get_sock_current(struct task_struct *task,
					  char *buf,
					  int buflen);

const char *policy_name(int policy);

static long device_ioctl(struct file *file,
						 unsigned int ioctl_num,
						 unsigned long ioctl_param);

static dev_t g_dev;
static struct cdev g_cdev;

static char *Message_Ptr;
static char message_buf_for_procs[4194304];
static char message_buf_for_fdt[524288];
static char message_buf_for_threads[262144];
static char message_buf_for_CPU[131072];
static char message_buf_for_sock[524288];
static char message_buf_for_memory[524288];
static char message_buf_for_anomalies[1048576];

DEFINE_MUTEX(mutex_for_message);

static struct file_operations g_fops = {
	.owner = THIS_MODULE,
	.open = device_open,
	.release = device_release,
	.unlocked_ioctl = device_ioctl};

static int __init task_walker_init(void)
{
	int result;

	printk(KERN_INFO "task_walker module initialization...\n");

	if ((result = alloc_chrdev_region(&g_dev, 0, 1, "task_walker")) < 0)
	{
		printk(KERN_INFO "cannot alloc char driver!...\n");
		return result;
	}
	cdev_init(&g_cdev, &g_fops);
	if ((result = cdev_add(&g_cdev, g_dev, 1)) < 0)
	{
		unregister_chrdev_region(g_dev, 1);
		printk(KERN_ERR "cannot add device!...\n");
		return result;
	}
	printk(KERN_INFO "task_walker module loaded. Major: %d Minor: %d\n", MAJOR(g_dev), MINOR(g_dev));

	// proc_walker_write(NULL, NULL, 0, NULL);

	return 0;
}

static int device_open(struct inode *inode,
					   struct file *file)
{
	printk(KERN_INFO "device_open()\n");
	return 0;
}

static int device_release(struct inode *inode,
						  struct file *file)
{
	printk(KERN_INFO "device_release()\n");
	return 0;
}

static long device_ioctl(struct file *file,
						 unsigned int ioctl_num,
						 unsigned long ioctl_param)
{
	mutex_lock(&mutex_for_message);
	switch (ioctl_num)
	{
	case IOC_WALK_PROCS:
		printk(KERN_INFO "ioctl: Walking procs...\n");
		proc_walker_write(file, NULL, 0, 0);

		if (copy_to_user((char __user *)ioctl_param, Message_Ptr, strlen(Message_Ptr) + 1))
		{
			mutex_unlock(&mutex_for_message);
			printk(KERN_ERR "Failed to copy data to user space\n");
			return -EFAULT;
		}
		break;
	case IOC_WALK_THREADS:
		printk(KERN_INFO "ioctl: Walking threads...\n");
		thread_walker_write(file, NULL, 0, 0);

		if (copy_to_user((char __user *)ioctl_param, Message_Ptr, strlen(Message_Ptr) + 1))
		{
			mutex_unlock(&mutex_for_message);
			printk(KERN_ERR "Failed to copy data to user space\n");
			return -EFAULT;
		}
		break;
	case IOC_WALK_FDT:
		printk(KERN_INFO "ioctl: Walking file descriptor table...\n");
		fdt_walker_write(file, NULL, 0, 0);

		if (copy_to_user((char __user *)ioctl_param, Message_Ptr, strlen(Message_Ptr) + 1))
		{
			mutex_unlock(&mutex_for_message);
			printk(KERN_ERR "Failed to copy data to user space\n");
			return -EFAULT;
		}
		break;
	case IOC_WALK_CPU:
		printk(KERN_INFO "ioctl: Walking CPU info...\n");
		CPU_walker_write(file, NULL, 0, 0);

		if (copy_to_user((char __user *)ioctl_param, Message_Ptr, strlen(Message_Ptr) + 1))
		{
			mutex_unlock(&mutex_for_message);
			printk(KERN_ERR "Failed to copy data to user space\n");
			return -EFAULT;
		}
		break;
	case IOC_WALK_SOCK:
		printk(KERN_INFO "ioctl: Walking network info...\n");
		sock_walker_write(file, NULL, 0, 0);

		if (copy_to_user((char __user *)ioctl_param, Message_Ptr, strlen(Message_Ptr) + 1))
		{
			mutex_unlock(&mutex_for_message);
			printk(KERN_ERR "Failed to copy data to user space\n");
			return -EFAULT;
		}
		break;
	case IOC_WALK_MEMORY:
		printk(KERN_INFO "ioctl: Walking memory info...\n");
		memory_walker_write(file, NULL, 0, 0);

		if (copy_to_user((char __user *)ioctl_param, Message_Ptr, strlen(Message_Ptr) + 1))
		{
			mutex_unlock(&mutex_for_message);
			printk(KERN_ERR "Failed to copy data to user space\n");
			return -EFAULT;
		}
		break;
	case IOC_WALK_ANOMALIES:
		printk(KERN_INFO "ioctl: Walking anomaly info...\n");
		anomalies_walker_write(file, NULL, 0, 0);

		if (copy_to_user((char __user *)ioctl_param, Message_Ptr, strlen(Message_Ptr) + 1))
		{
			mutex_unlock(&mutex_for_message);
			printk(KERN_ERR "Failed to copy data to user space\n");
			return -EFAULT;
		}
		break;
	default:
		mutex_unlock(&mutex_for_message);
		printk(KERN_INFO "ioctl: Unknown command\n");
		return -ENOTTY;
	}
	mutex_unlock(&mutex_for_message);
	return 0;
}

static void __exit task_walker_exit(void)
{
	cdev_del(&g_cdev);
	unregister_chrdev_region(g_dev, 1);

	printk(KERN_INFO "task_walker module exit...\n");
}

static ssize_t fdt_walker_write(struct file *file,
								char __user *buffer,
								size_t length,
								loff_t *offset)
{
	struct task_struct *task;
	int offset_buf = 0;
	int remaining = sizeof(message_buf_for_fdt) - 1;

	printk(KERN_INFO "Walking through the task list...\n");

	rcu_read_lock();
	for_each_process(task)
	{
		static char message_buf_for_files[16384];
		int bytes = 0;
		get_file_path_current(task, message_buf_for_files, sizeof(message_buf_for_files));

		bytes = snprintf(message_buf_for_fdt + offset_buf, remaining,
						 "PID: %d | Comm: %s\n",
						 task->pid, task->comm);

		if (bytes <= 0 || bytes >= remaining)
			break;

		offset_buf += bytes;
		remaining -= bytes;

		bytes = snprintf(message_buf_for_fdt + offset_buf, remaining,
						 "FILE PATH: %s\n", message_buf_for_files);

		if (bytes <= 0 || bytes >= remaining)
			break;

		offset_buf += bytes;
		remaining -= bytes;
	}
	rcu_read_unlock();

	message_buf_for_fdt[offset_buf] = '\0';
	Message_Ptr = message_buf_for_fdt;
	return offset_buf;
}

static ssize_t proc_walker_write(struct file *file,
								 char __user *buffer,
								 size_t length,
								 loff_t *offset)
{
	struct task_struct *task;
	int offset_buf = 0;
	int remaining = sizeof(message_buf_for_procs) - 1;

	printk(KERN_INFO "Walking through the task list...\n");

	rcu_read_lock();
	for_each_process(task)
	{
		int bytes = 0;

		bytes = snprintf(message_buf_for_procs + offset_buf, remaining,
						 "PID: %d | Comm: %s\n",
						 task->pid, task->comm);

		if (bytes <= 0 || bytes >= remaining)
			break;

		offset_buf += bytes;
		remaining -= bytes;

		struct task_struct *parent_proc, *child_proc;
		for (parent_proc = task->real_parent;
			 parent_proc && parent_proc->pid > 0;
			 parent_proc = parent_proc->real_parent)
		{
			bytes = snprintf(message_buf_for_procs + offset_buf, remaining,
							 "  PARENT PID: %d | Comm: %s\n",
							 parent_proc->pid, parent_proc->comm);

			if (bytes <= 0 || bytes >= remaining)
				break;

			offset_buf += bytes;
			remaining -= bytes;
		}

		list_for_each_entry(child_proc, &task->children, sibling)
		{
			bytes = snprintf(message_buf_for_procs + offset_buf, remaining,
							 "  CHILD PID: %d | Comm: %s\n",
							 task_pid_nr(child_proc), child_proc->comm);
			if (bytes <= 0 || bytes >= remaining)
				break;

			offset_buf += bytes;
			remaining -= bytes;
		}
	}
	rcu_read_unlock();

	message_buf_for_procs[offset_buf] = '\0';
	Message_Ptr = message_buf_for_procs;
	return offset_buf;
}

static ssize_t thread_walker_write(struct file *file,
								   char __user *buffer,
								   size_t length,
								   loff_t *offset)
{
	struct task_struct *proc;
	struct task_struct *thread;
	int offset_buf = 0;
	int remaining = sizeof(message_buf_for_threads) - 1;

	printk(KERN_INFO "Walking through the task list...\n");

	rcu_read_lock();
	for_each_process(proc)
	{
		int bytes = snprintf(message_buf_for_threads + offset_buf, remaining,
							 "PID: %d | Comm: %s\n",
							 proc->pid, proc->comm);

		if (bytes <= 0 || bytes >= remaining)
			break;

		offset_buf += bytes;
		remaining -= bytes;

		for_each_thread(proc, thread)
		{
			bytes = snprintf(message_buf_for_threads + offset_buf, remaining,
							 "	THREAD: %d | Comm: %s\n",
							 thread->pid, thread->comm);

			if (bytes <= 0 || bytes >= remaining)
				break;

			offset_buf += bytes;
			remaining -= bytes;
		}
	}
	rcu_read_unlock();

	message_buf_for_threads[offset_buf] = '\0';
	Message_Ptr = message_buf_for_threads;
	return offset_buf;
}

static ssize_t CPU_walker_write(struct file *file,
								char __user *buffer,
								size_t length,
								loff_t *offset)
{
	struct task_struct *task;
	int offset_buf = 0;
	int remaining = sizeof(message_buf_for_CPU) - 1;

	// Get online CPU count
	int online_cpus = max(1, num_online_cpus());

	printk(KERN_INFO "Walking through the CPU info...\n");

	rcu_read_lock();
	for_each_process(task)
	{
		unsigned long long utime_ns, stime_ns, total_ns;

		task_cputime_adjusted(task, &utime_ns, &stime_ns);

		total_ns = utime_ns + stime_ns;

		int bytes = 0;
		bytes = snprintf(message_buf_for_CPU + offset_buf, remaining,
						 "PID: %d | COMM: %s\n\
CURRENT CPU: %d\n\
USER TIME: %llu nanosec | SYSTEM TIME: %llu nanosec | TOTAL TIME: %llu nanosec\n\
NICE: %d | CURRENT PRIORITY: %d | BASE PRIORITY: %d | POLICY: %s\n\
CPU usage: %lu%%\n",
						 task->pid, task->comm,
						 task_cpu(task),
						 div_u64(utime_ns, NSEC_PER_USEC), div_u64(stime_ns, NSEC_PER_USEC), div_u64(total_ns, NSEC_PER_USEC),
						 task_nice(task), task->prio, task->static_prio, policy_name(task->policy),
						 task->se.avg.util_avg * 100 / (SCHED_CAPACITY_SCALE * online_cpus));

		if (bytes <= 0 || bytes >= remaining)
			break;

		offset_buf += bytes;
		remaining -= bytes;
	}
	rcu_read_unlock();

	message_buf_for_CPU[offset_buf] = '\0';
	Message_Ptr = message_buf_for_CPU;
	return offset_buf;
}

static ssize_t sock_walker_write(struct file *file,
								 char __user *buffer,
								 size_t length,
								 loff_t *offset)
{
	struct task_struct *task;
	int offset_buf = 0;
	int remaining = sizeof(message_buf_for_sock) - 1;

	printk(KERN_INFO "Walking through the task list...\n");

	rcu_read_lock();
	for_each_process(task)
	{
		static char message_buf_for_socket[32768];
		int bytes = 0;
		get_sock_current(task, message_buf_for_socket, sizeof(message_buf_for_socket));

		bytes = snprintf(message_buf_for_sock + offset_buf, remaining,
						 "PID: %d | Comm: %s\n",
						 task->pid, task->comm);

		if (bytes <= 0 || bytes >= remaining)
			break;

		offset_buf += bytes;
		remaining -= bytes;

		bytes = snprintf(message_buf_for_sock + offset_buf, remaining,
						 "SOCKET INFO: %s\n", message_buf_for_socket);

		if (bytes <= 0 || bytes >= remaining)
			break;

		offset_buf += bytes;
		remaining -= bytes;
	}
	rcu_read_unlock();

	message_buf_for_sock[offset_buf] = '\0';
	Message_Ptr = message_buf_for_sock;
	return offset_buf;
}

static ssize_t memory_walker_write(struct file *file,
								   char __user *buffer,
								   size_t length,
								   loff_t *offset)
{
	struct task_struct *task;
	int offset_buf = 0;
	int remaining = sizeof(message_buf_for_memory) - 1;

	unsigned long rss_pages;
	unsigned long rss_bytes;
	unsigned long file_pages;
	unsigned long shm_pages;

	unsigned long shr_pages;
	unsigned long shr_bytes;

	unsigned long virt_kb;

	struct mm_struct *mm;

	printk(KERN_INFO "Walking through the memory info...\n");

	rcu_read_lock();
	for_each_process(task)
	{
		get_task_struct(task); // pin task to prevent it from being freed while we access it
		char state = task_state_to_char(task);

		mm = get_task_mm(task); // pin memory to prevent it from being freed while we access it

		if (mm)
		{
			// Resident memory
			rss_pages = get_mm_rss(mm);
			rss_bytes = rss_pages * PAGE_SIZE;

			// Shared memory
			file_pages = get_mm_counter(mm, MM_FILEPAGES);
			shm_pages = get_mm_counter(mm, MM_SHMEMPAGES);

			shr_pages = file_pages + shm_pages;
			shr_bytes = shr_pages * PAGE_SIZE;

			// Virt Memory
			virt_kb = mm->total_vm * PAGE_SIZE;

			mmput(mm);

			int bytes = snprintf(message_buf_for_memory + offset_buf, remaining,
								 "PID: %d | COMM: %s\n\
STATE: %c | VIRTUAL MEM: %lu KB | RESIDENT MEM: %lu KB | SHARED MEM: %lu KB\n",
								 task->pid, task->comm,
								 state, virt_kb >> 10, rss_bytes >> 10, shr_bytes >> 10);

			if (bytes <= 0 || bytes >= remaining)
			{
				put_task_struct(task); // unpin task
				break;
			}
			offset_buf += bytes;
			remaining -= bytes;

			put_task_struct(task); // unpin task
		}
		else
		{

			int bytes = snprintf(message_buf_for_memory + offset_buf, remaining,
								 "PID: %d | COMM: %s\n\
STATE: %c\n",
								 task->pid, task->comm,
								 state);

			if (bytes <= 0 || bytes >= remaining)
			{
				put_task_struct(task); // unpin task
				break;
			}
			offset_buf += bytes;
			remaining -= bytes;

			put_task_struct(task);
		}
	}
	rcu_read_unlock();

	message_buf_for_memory[offset_buf] = '\0';
	Message_Ptr = message_buf_for_memory;
	return offset_buf;
}

static ssize_t anomalies_walker_write(struct file *file,
									  char __user *buffer,
									  size_t length,
									  loff_t *offset)
{
	struct task_struct *proc;
	struct task_struct *thread;
	int offset_buf = 0;
	int remaining = sizeof(message_buf_for_anomalies) - 1;
	const struct cred *init_cred = NULL;

	printk(KERN_INFO "Walking through the anomalies...\n");

	rcu_read_lock();
	for_each_process(proc)
	{
		if (proc->pid == 1)
		{
			init_cred = __task_cred(proc);
		}

		int bytes = snprintf(message_buf_for_anomalies + offset_buf, remaining,
							 "\n******************	   PID: %d | Comm: %s	   ******************\n",
							 proc->pid, proc->comm);

		if (bytes <= 0 || bytes >= remaining)
			break;

		offset_buf += bytes;
		remaining -= bytes;

		// --------------------------------------------
		// this for is for unlinked executables, which can be a sign of malicious activity.
		// We want to get the exe path for each thread, as some threads might have different
		// exe paths due to execve calls.
		for_each_thread(proc, thread)
		{
			static char message_buf_for_exe_path[16384];

			get_exe_path(thread, message_buf_for_exe_path, sizeof(message_buf_for_exe_path));

			bytes = snprintf(message_buf_for_anomalies + offset_buf, remaining,
							 "	Thread info: %d | Comm: %s\n\
	%s\n", /*exe path*/
							 thread->pid, thread->comm,
							 message_buf_for_exe_path);

			if (bytes <= 0 || bytes >= remaining)
				break;

			offset_buf += bytes;
			remaining -= bytes;
		}

		// --------------------------------------------
		// Check for namespace anomalies, which can be a sign of container escape attempts.
		{
			struct nsproxy *ns = proc->nsproxy;

			if (ns)
			{

				bytes = scnprintf(message_buf_for_anomalies + offset_buf, remaining,
								  "	Namespace info:\n\
	mnt:[%u]\n\
	pid:[%u]\n\
	net:[%u]\n\
	uts:[%u]\n\
	ipc:[%u]\n\
	user:[%u]\n\
	cgroup:[%u]\n\
	depth: [%u]\n",
								  ((struct ns_common *)ns->mnt_ns)->inum,
								  ns->pid_ns_for_children->ns.inum,
								  ns->net_ns->ns.inum,
								  ns->uts_ns->ns.inum,
								  ns->ipc_ns->ns.inum,
								  __task_cred(proc)->user_ns->ns.inum,
								  ns->cgroup_ns->ns.inum,
								  ns->pid_ns_for_children->level);

				if (bytes <= 0 || bytes >= remaining)
					break;

				offset_buf += bytes;
				remaining -= bytes;
				// printk(KERN_INFO "%s\n", buf);
			}
		}

		// --------------------------------------------
		// Privilege escalation detection. A process running as root that was spawned
		// by a non-root parent is suspicious.
		{
			const struct task_struct *parent_proc = rcu_dereference(proc->real_parent);

			const struct cred *current_cred = __task_cred(proc);
			const struct cred *parent_cred = __task_cred(parent_proc);

			if (current_cred->euid.val == 0 && parent_cred->euid.val != 0)
			{
				char *root_info = current_cred->user_ns == init_cred->user_ns ? "yes" : "no";

				bytes = scnprintf(message_buf_for_anomalies + offset_buf, remaining,
								  "\n	Privesc info:\n\
	Possible privilege escalation detected!\n\
	Is current process in the same user namespace as init? %s\n\
	Parent PID: %d | Parent Comm: %s | Parent UID: %d\n\
	Current PID: %d | Current Comm: %s | Current UID: %d\n",
								  root_info,
								  parent_proc->pid, parent_proc->comm, parent_cred->euid.val,
								  proc->pid, proc->comm, current_cred->euid.val);

				if (bytes <= 0 || bytes >= remaining)
					break;

				offset_buf += bytes;
				remaining -= bytes;
			}
		}

		// Start time information
		{
			u64 start_ns;
			struct timespec64 ts;

			// Start time since boot
			start_ns = ktime_to_ns(proc->start_time);
			bytes = scnprintf(message_buf_for_anomalies + offset_buf, remaining,
							  "\n	Time info:\n\
	start_time (ns since boot): %llu\n",
							  start_ns);

			if (bytes <= 0 || bytes >= remaining)
				break;

			offset_buf += bytes;
			remaining -= bytes;

			// “Wall-clock” start time computed via offset

			u64 now_real_ns = ktime_get_real_ns();
			u64 now_boot_ns = ktime_get_boottime_ns();
			u64 real_ns = now_real_ns - now_boot_ns + start_ns;

			ts = ns_to_timespec64((s64)real_ns);

			bytes = scnprintf(message_buf_for_anomalies + offset_buf, remaining,
							  "	computed start realtime: %lld.%09ld\n",
							  (long long)ts.tv_sec, ts.tv_nsec);

			if (bytes <= 0 || bytes >= remaining)
				break;

			offset_buf += bytes;
			remaining -= bytes;
		}

		// Command line information. A process with an empty command line or a command line
		// that doesn't match the exe path can be suspicious.
		{
			// char message_buf_for_full_cmd_path[512];

			char *message_buf_for_full_cmd_path = kstrdup_quotable_cmdline(proc, GFP_KERNEL);

			bytes = snprintf(message_buf_for_anomalies + offset_buf, remaining,
							 "\n	Command Line: %s\n",
							 message_buf_for_full_cmd_path);

			if (bytes <= 0 || bytes >= remaining)
				break;

			offset_buf += bytes;
			remaining -= bytes;
		}

		{
			static char message_buf_for_vma_info[16384];

			get_vma_info(proc, message_buf_for_vma_info, sizeof(message_buf_for_vma_info));

			bytes = snprintf(message_buf_for_anomalies + offset_buf, remaining,
							 "\n	VMA Info:\n %s\n",
							 message_buf_for_vma_info);

			if (bytes <= 0 || bytes >= remaining)
				break;

			offset_buf += bytes;
			remaining -= bytes;
		}
	}
	rcu_read_unlock();

	message_buf_for_anomalies[offset_buf] = '\0';
	Message_Ptr = message_buf_for_anomalies;
	return offset_buf;
}

void get_vma_info(struct task_struct *task, char *buf, int buflen)
{
	struct mm_struct *mm = get_task_mm(task);
	int offset_buf = 0;

	if (!mm)
	{
		buf[offset_buf] = '\0';
		return;
	}

	struct vm_area_struct *vma;
	VMA_ITERATOR(vmi, mm, 0);

	mmap_read_lock(mm);

	// temp buffer for d_path, as it can modify the input buffer
	char *temp_buf = (char *)kmalloc(16384, GFP_ATOMIC);
	if (temp_buf == NULL)
	{
		pr_err("Failed to allocate memory for temp_buf\n");
		mmap_read_unlock(mm);
		mmput(mm);
		buf[offset_buf] = '\0';
		return;
	}

	for_each_vma(vmi, vma)
	{
		unsigned long flags = vma->vm_flags;

		if (vma->vm_file)
		{
			char *path = d_path(&vma->vm_file->f_path, temp_buf, 16384);
			if (!IS_ERR(path))
			{
				int bytes = scnprintf(buf + offset_buf, buflen,
									  "	VMA %lx-%lx flags=0x%lx %c%c%c %s file=%s\n",
									  vma->vm_start, vma->vm_end, flags,
									  (flags & VM_READ) ? 'r' : '-',
									  (flags & VM_WRITE) ? 'w' : '-',
									  (flags & VM_EXEC) ? 'x' : '-',
									  (flags & VM_SHARED) ? "shared" : "private",
									  path);

				// pr_info("VMA %lx-%lx flags=%lx\n", vma->vm_start, vma->vm_end, vma->vm_flags);

				if (bytes >= buflen)
				{
					buf[offset_buf] = '\0';
					mmap_read_unlock(mm);
					mmput(mm);
					kfree(temp_buf);
					return;
				}

				offset_buf += bytes;
				buflen -= bytes;
			}
		}
		else
		{
			int bytes = scnprintf(buf + offset_buf, buflen,
								  "	VMA %lx-%lx flags=0x%lx %c%c%c %s\n",
								  vma->vm_start, vma->vm_end, flags,
								  (flags & VM_READ) ? 'r' : '-',
								  (flags & VM_WRITE) ? 'w' : '-',
								  (flags & VM_EXEC) ? 'x' : '-',
								  (flags & VM_SHARED) ? "shared" : "private");

			// pr_info("VMA %lx-%lx flags=%lx\n", vma->vm_start, vma->vm_end, vma->vm_flags);

			if (bytes >= buflen)
			{
				buf[offset_buf] = '\0';
				mmap_read_unlock(mm);
				mmput(mm);
				kfree(temp_buf);
				return;
			}

			offset_buf += bytes;
			buflen -= bytes;
		}
	}

	mmap_read_unlock(mm);
	mmput(mm);
	kfree(temp_buf);
	buf[offset_buf] = '\0';
}

void get_exe_path(struct task_struct *task, char *buf, int buflen)
{
	struct file *exe_file = NULL;
	int offset_buf = 0;

	struct mm_struct *mm = get_task_mm(task);
	if (!mm)
	{
		pr_info("No memory struct for PID %d\n", task->pid);
		buf[offset_buf] = '\0';
		return;
	}

	exe_file = rcu_dereference(mm->exe_file);

	if (exe_file)
	{
		get_file(exe_file);
	}
	else
	{
		buf[offset_buf] = '\0';
		mmput(mm);
		return;
	}
	mmput(mm);

	char *temp_buf = (char *)kmalloc(8192, GFP_ATOMIC);
	if (!temp_buf)
	{
		pr_err("Failed to allocate memory for temp_buf\n");
		fput(exe_file);
		buf[offset_buf] = '\0';
		return;
	}

	if (exe_file)
	{
		char *path = d_path(&exe_file->f_path, temp_buf, 8192);
		fput(exe_file);

		if (!IS_ERR(path))
		{
			int bytes = snprintf(buf + offset_buf, buflen,
								 "\n	Executable path: %s\n", path);

			// pr_info("Executable path for PID %d: %s\n", task->pid, path);

			if (bytes >= buflen)
			{
				kfree(temp_buf);
				buf[offset_buf] = '\0';
				return;
			}

			offset_buf += bytes;
			buflen -= bytes;
		}
		else
		{
			// pr_info("exec path error\n");
		}
	}
	kfree(temp_buf);
	buf[offset_buf] = '\0';
}

void get_file_path_current(struct task_struct *task, char *buf, int buflen)
{
	struct file *file_obj;
	int i;
	int offset_buf = 0;
	struct files_struct *files = rcu_dereference(task->files);
	struct fdtable *fdt;

	// temp buffer for d_path, as it can modify the input buffer
	char *temp_buf = (char *)kmalloc(65536, GFP_ATOMIC);
	if (temp_buf == NULL)
	{
		pr_err("Failed to allocate memory for temp_buf\n");
		buf[offset_buf] = '\0';
		return;
	}

	if (!files)
	{
		kfree(temp_buf);
		buf[offset_buf] = '\0';
		return;
	}

	fdt = files_fdtable(files);

	for (i = 0; i < fdt->max_fds; i++)
	{
		spin_lock(&files->file_lock);
		file_obj = rcu_dereference_raw(fdt->fd[i]);
		if (file_obj)
		{
			get_file(file_obj); // pin file to prevent it from being freed while we access it
			spin_unlock(&files->file_lock);
			char *path = d_path(&file_obj->f_path, temp_buf, buflen);
			fput(file_obj); // unpin file
			if (!IS_ERR(path))
			{
				int bytes = snprintf(buf + offset_buf, buflen,
									 "File path for %i: %s\n", i, path);

				if (bytes >= buflen)
					break;

				offset_buf += bytes;
				buflen -= bytes;
			}
			else
			{
				pr_info("FD %d: <d_path error %ld>\n", i, PTR_ERR(path));
			}
		}
		else
		{
			spin_unlock(&files->file_lock);
		}
	}
	kfree(temp_buf);
	// pr_info("%s\n", buf);
	buf[offset_buf] = '\0';
}

void get_sock_current(struct task_struct *task, char *buf, int buflen)
{
	int i;
	int offset_buf = 0;
	int remaining = buflen;
	struct files_struct *files = rcu_dereference(task->files);
	struct fdtable *fdt;

	if (!buf || buflen <= 0)
		return;

	buf[0] = '\0';

	if (!files)
		return;

	fdt = files_fdtable(files);

	if (!fdt)
		return;

	for (i = 0; i < fdt->max_fds; i++)
	{
		struct file *file_obj = NULL;
		struct socket *sock = NULL;
		struct sock *sk = NULL;
		int bytes = 0;

		spin_lock(&files->file_lock);
		file_obj = rcu_dereference_raw(fdt->fd[i]);
		if (file_obj)
			get_file(file_obj); // pin file to safely inspect socket
		spin_unlock(&files->file_lock);

		if (!file_obj)
			continue;

		sock = sock_from_file(file_obj);
		if (!sock)
		{
			fput(file_obj); // unpin non-socket file
			continue;
		}

		sk = sock->sk;

		if (sk)
		{
			switch (sk->sk_family)
			{
			case AF_INET:
			{
				struct inet_sock *inet = inet_sk(sk);
				__be32 saddr = inet->inet_saddr;
				__be32 daddr = inet->inet_daddr;
				__u16 sport = inet->inet_num;
				__u16 dport = ntohs(inet->inet_dport);

				char src[16], dst[16];

				snprintf(src, sizeof(src), "%pI4", &saddr);
				snprintf(dst, sizeof(dst), "%pI4", &daddr);

				bytes = snprintf(buf + offset_buf, remaining,
								 "FD %d: family=%d type=%d state=%d %s:%u -> %s:%u\n",
								 i, sk->sk_family, sock->type, sk->sk_state,
								 src, sport, dst, dport);

				break;
			}
			case AF_INET6:
			{
				struct inet_sock *inet = inet_sk(sk);
				struct ipv6_pinfo *np = inet6_sk(sk);
				const struct in6_addr *saddr6 = &np->saddr;
				const struct in6_addr *daddr6 = &sk->sk_v6_daddr;
				__u16 sport = inet->inet_num;		   /* host order */
				__u16 dport = ntohs(inet->inet_dport); /* network -> host */

				char src[48], dst[48];

				snprintf(src, sizeof(src), "%pI6c", saddr6);
				snprintf(dst, sizeof(dst), "%pI6c", daddr6);

				bytes = snprintf(buf + offset_buf, remaining,
								 "FD %d: family=%d type=%d state=%d [%s]:%u -> [%s]:%u\n",
								 i, sk->sk_family, sock->type, sk->sk_state,
								 src, sport, dst, dport);

				break;
			}
			default:
				/* Include every other family (AF_UNIX, AF_NETLINK, etc.). */
				bytes = snprintf(buf + offset_buf, remaining,
								 "FD %d: family=%d type=%d state=%d\n",
								 i, sk->sk_family, sock->type, sk->sk_state);
				break;
			}

			if (bytes <= 0 || bytes >= remaining)
			{
				fput(file_obj); // unpin file
				break;
			}

			offset_buf += bytes;
			remaining -= bytes;
		}
		else
		{
			bytes = snprintf(buf + offset_buf, remaining,
							 "FD %d: family=unknown type=%d state=unknown\n",
							 i, sock->type);
			if (bytes <= 0 || bytes >= remaining)
			{
				fput(file_obj); // unpin file
				break;
			}
			offset_buf += bytes;
			remaining -= bytes;
		}

		fput(file_obj); // unpin file
	}

	buf[offset_buf] = '\0';
}

const char *policy_name(int policy)
{
	switch (policy)
	{
	case SCHED_NORMAL:
		return "normal";
	case SCHED_FIFO:
		return "fifo";
	case SCHED_RR:
		return "rr";
	case SCHED_BATCH:
		return "batch";
	case SCHED_IDLE:
		return "idle";
	case SCHED_DEADLINE:
		return "deadline";
	default:
		return "unknown";
	}
}

module_init(task_walker_init);
module_exit(task_walker_exit);
