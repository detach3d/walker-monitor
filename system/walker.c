#include <stdio.h>
#include <stdlib.h>
#include <fcntl.h>		/* open */
#include <unistd.h>		/* exit */
#include <sys/ioctl.h>		/* ioctl */
#include "task_walker.h"

// Use an absolute device path so the binary can be run from any directory.
#undef DEVICE_FILE_NAME
#define DEVICE_FILE_NAME "/dev/task_walker"

void proc_printer(){
	int file_desc, ret_val;
	char msg[4194304] = {0};

	file_desc = open(DEVICE_FILE_NAME, 0);
	if (file_desc < 0) {
		printf("Can't open device file: %s\n", DEVICE_FILE_NAME);
		exit(-1);
	}
    ret_val = ioctl(file_desc, IOC_WALK_PROCS, (unsigned long)msg);
	
    if (ret_val < 0) {
        printf("ioctl_set_msg failed:%d\n", ret_val);
        exit(-1);
    }

    printf("Message by ioctl:\n%s\n", msg);

	close(file_desc);
}

void thread_printer(){
	int file_desc, ret_val;
	char msg[262144] = {0};

	file_desc = open(DEVICE_FILE_NAME, 0);
	if (file_desc < 0) {
		printf("Can't open device file: %s\n", DEVICE_FILE_NAME);
		exit(-1);
	}
    ret_val = ioctl(file_desc, IOC_WALK_THREADS, (unsigned long)msg);
	
    if (ret_val < 0) {
        printf("ioctl_set_msg failed:%d\n", ret_val);
        exit(-1);
    }

    printf("Message by ioctl:\n%s\n", msg);

	close(file_desc);
}

void fdt_printer(){
	int file_desc, ret_val;
	char msg[524288] = {0};

	file_desc = open(DEVICE_FILE_NAME, 0);
	if (file_desc < 0) {
		printf("Can't open device file: %s\n", DEVICE_FILE_NAME);
		exit(-1);
	}
    ret_val = ioctl(file_desc, IOC_WALK_FDT, (unsigned long)msg);
	
    if (ret_val < 0) {
        printf("ioctl_set_msg failed:%d\n", ret_val);
        exit(-1);
    }

    printf("Message by ioctl:\n%s\n", msg);

	close(file_desc);
}

void CPU_printer(){
	int file_desc, ret_val;
	char msg[131072] = {0};

	file_desc = open(DEVICE_FILE_NAME, 0);
	if (file_desc < 0) {
		printf("Can't open device file: %s\n", DEVICE_FILE_NAME);
		exit(-1);
	}
    ret_val = ioctl(file_desc, IOC_WALK_CPU, (unsigned long)msg);
	
    if (ret_val < 0) {
        printf("ioctl_set_msg failed:%d\n", ret_val);
        exit(-1);
    }

    printf("Message by ioctl:\n%s\n", msg);

	close(file_desc);
}

void sock_printer(){
	int file_desc, ret_val;
	char msg[524288] = {0};

	file_desc = open(DEVICE_FILE_NAME, 0);
	if (file_desc < 0) {
		printf("Can't open device file: %s\n", DEVICE_FILE_NAME);
		exit(-1);
	}
    ret_val = ioctl(file_desc, IOC_WALK_SOCK, (unsigned long)msg);
	
    if (ret_val < 0) {
        printf("ioctl_set_msg failed:%d\n", ret_val);
        exit(-1);
    }

    printf("Message by ioctl:\n%s\n", msg);

	close(file_desc);
}

void memory_printer(){
	int file_desc, ret_val;
	char msg[524288] = {0};

	file_desc = open(DEVICE_FILE_NAME, 0);
	if (file_desc < 0) {
		printf("Can't open device file: %s\n", DEVICE_FILE_NAME);
		exit(-1);
	}
    ret_val = ioctl(file_desc, IOC_WALK_MEMORY, (unsigned long)msg);
	
    if (ret_val < 0) {
        printf("ioctl_set_msg failed:%d\n", ret_val);
        exit(-1);
    }

    printf("Message by ioctl:\n%s\n", msg);

	close(file_desc);
}

void anomaly_printer(){
	int file_desc, ret_val;
	char msg[1048576] = {0};

	file_desc = open(DEVICE_FILE_NAME, 0);
	if (file_desc < 0) {
		printf("Can't open device file: %s\n", DEVICE_FILE_NAME);
		exit(-1);
	}
    ret_val = ioctl(file_desc, IOC_WALK_ANOMALIES, (unsigned long)msg);
	
    if (ret_val < 0) {
        printf("ioctl_set_msg failed:%d\n", ret_val);
        exit(-1);
    }

    printf("Message by ioctl:\n%s\n", msg);

	close(file_desc);
}

int 
main(int argc, char *argv[])
{

	if (argc < 2) {
		printf("Usage: %s <name>\n", argv[0]);
		return 1; // Indicate error
	}

	int opt;
    while ((opt = getopt(argc, argv, "ptfcsma")) != -1) {
        switch (opt) {
            case 'p': proc_printer(); break;
            case 't': thread_printer(); break;
			case 'f': fdt_printer(); break;
			case 'c': CPU_printer(); break;
			case 's': sock_printer(); break;
			case 'm': memory_printer(); break;
			case 'a': anomaly_printer(); break;
            default: fprintf(stderr, "Usage: %s [-p] [-t] [-f] [-c] [-s] [-m] [-a]\n", argv[0]);
        }
    }

	return 0;
}
