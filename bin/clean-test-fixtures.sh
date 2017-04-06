#!/bin/bash

find test/plugins/fixtures/ -name node_modules -exec rm -Rv {} \; 2> /dev/null
