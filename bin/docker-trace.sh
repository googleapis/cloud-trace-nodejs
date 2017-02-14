#!/bin/bash
COMMAND=$1
if [ $COMMAND = 'start' ]; then
  docker run -p 127.0.0.1:27017:27017 -d mongo
  docker run -p 127.0.0.1:6379:6379 -d redis
  docker run -p 127.0.0.1:3306:3306 -e MYSQL_ROOT_PASSWORD='Password12!' -e MYSQL_DATABASE=test -d mysql
fi
if [ $COMMAND = 'stop' ]; then
  docker stop `docker ps | sed -En 's/([a-f0-9]+)[[:space:]]+(redis|mongo|mysql).*/\1/p'`
fi
