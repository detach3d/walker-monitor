#include <linux/module.h>
#include <linux/kernel.h>
#include <linux/fs.h>
#include <linux/cdev.h>
#include <linux/string.h>
#include <linux/uaccess.h>
#include <linux/dcache.h>
#include <linux/fdtable.h>
#include <linux/sched/cputime.h>
#include <linux/file.h>
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

void get_file_path_current(struct task_struct *task,
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
	switch (ioctl_num)
	{
	case IOC_WALK_PROCS:
		printk(KERN_INFO "ioctl: Walking procs...\n");
		proc_walker_write(file, NULL, 0, 0);

		if (copy_to_user((char __user *)ioctl_param, Message_Ptr, strlen(Message_Ptr) + 1))
		{
			printk(KERN_ERR "Failed to copy data to user space\n");
			return -EFAULT;
		}
		break;
	case IOC_WALK_THREADS:
		printk(KERN_INFO "ioctl: Walking threads...\n");
		thread_walker_write(file, NULL, 0, 0);

		if (copy_to_user((char __user *)ioctl_param, Message_Ptr, strlen(Message_Ptr) + 1))
		{
			printk(KERN_ERR "Failed to copy data to user space\n");
			return -EFAULT;
		}
		break;
	case IOC_WALK_FDT:
		printk(KERN_INFO "ioctl: Walking file descriptor table...\n");
		fdt_walker_write(file, NULL, 0, 0);

		if (copy_to_user((char __user *)ioctl_param, Message_Ptr, strlen(Message_Ptr) + 1))
		{
			printk(KERN_ERR "Failed to copy data to user space\n");
			return -EFAULT;
		}
		break;
	case IOC_WALK_CPU:
		printk(KERN_INFO "ioctl: Walking CPU info...\n");
		CPU_walker_write(file, NULL, 0, 0);

		if (copy_to_user((char __user *)ioctl_param, Message_Ptr, strlen(Message_Ptr) + 1))
		{
			printk(KERN_ERR "Failed to copy data to user space\n");
			return -EFAULT;
		}
		break;
	default:
		printk(KERN_INFO "ioctl: Unknown command\n");
		return -ENOTTY;
	}
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

		if (bytes < remaining)
		{
			offset_buf += bytes;
			remaining -= bytes;
			// pr_info("%s", message_buf_for_procs + offset_buf - bytes);
		}
		else
		{
			break;
		}

		bytes = snprintf(message_buf_for_fdt + offset_buf, remaining,
						 "FILE PATH: %s\n", message_buf_for_files);

		if (bytes < remaining)
		{
			offset_buf += bytes;
			remaining -= bytes;
			// pr_info("%s", message_buf_for_procs + offset_buf - bytes);
		}
		else
		{
			break;
		}
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
		if (bytes < remaining)
		{
			offset_buf += bytes;
			remaining -= bytes;
			// pr_info("%s", message_buf_for_threads + offset_buf - bytes);
		}
		else
		{
			break;
		}
		for_each_thread(proc, thread)
		{
			bytes = snprintf(message_buf_for_threads + offset_buf, remaining,
							 "	THREAD: %d | Comm: %s\n",
							 thread->pid, thread->comm);

			if (bytes < remaining)
			{
				offset_buf += bytes;
				remaining -= bytes;
				// pr_info("%s", message_buf_for_threads + offset_buf - bytes);
			}
			else
			{
				break;
			}
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
NICE: %d | CURRENT PRIORITY: %d | BASE PRIORITY: %d | POLICY: %s\n",
						 task->pid, task->comm,
						 task_cpu(task),
						 div_u64(utime_ns,  NSEC_PER_USEC), div_u64(stime_ns,  NSEC_PER_USEC), div_u64(total_ns,  NSEC_PER_USEC),
						 task_nice(task), task->prio, task->static_prio, policy_name(task->policy));

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

void get_file_path_current(struct task_struct *task, char *buf, int buflen)
{
	struct file *file_obj;
	int i;
	int offset_buf = 0;
	struct files_struct *files = task->files;
	struct fdtable *fdt;
	if (files)
	{
		fdt = files_fdtable(files);
	}

	for (i = 0; i < fdt->max_fds; i++)
	{
		file_obj = fdt->fd[i];
		if (file_obj)
		{
			char *path = d_path(&file_obj->f_path, buf, buflen);

			if (!IS_ERR(path))
			{
				int bytes = snprintf(buf + offset_buf, buflen,
									 "File path for %i: %s\n", i, path);

				if (bytes < buflen)
				{
					offset_buf += bytes;
					buflen -= bytes;
				}
				else
				{
					break;
				}
			}
			else
			{
				pr_info("FD %d: <d_path error %ld>\n", i, PTR_ERR(path));
			}
		}
		else if (i == 0)
		{
			int bytes = snprintf(buf + offset_buf, buflen,
								 "No files for this process\n");

			if (bytes < buflen)
			{
				offset_buf += bytes;
				buflen -= bytes;
			}
			break;
		}
	}
	// pr_info("%s\n", buf);
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
