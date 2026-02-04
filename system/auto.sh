#!/bin/bash

make clean
make
sudo ./unload.sh task_walker
sudo ./load.sh task_walker
gcc -Wall walker.c -o walker
./walker -c > proc.txt