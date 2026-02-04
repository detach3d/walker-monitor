#!/bin/bash

module=$1

/sbin/rmmod ./${module}.ko || exit 1
rm -f $module