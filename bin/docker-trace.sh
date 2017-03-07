#!/bin/bash
if [ ! -z $1 ]; then
  COMMAND=$1
  if [ $COMMAND = 'start' ]; then
    docker run --name trace-test-mongo -p 127.0.0.1:27017:27017 -d mongo &&\
    docker run --name trace-test-redis -p 127.0.0.1:6379:6379 -d redis &&\
    docker run --name trace-test-mysql -p 127.0.0.1:3306:3306 -e MYSQL_ROOT_PASSWORD='Password12!' -e MYSQL_DATABASE=test -d mysql
    docker run --name trace-test-postgres -p 127.0.0.1:5432:5432 -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD='Password12!' -e POSTGRES_DB=test -d postgres
    exit $?
  elif [ $COMMAND = 'stop' ]; then
    docker stop trace-test-mongo
    docker stop trace-test-redis
    docker stop trace-test-mysql
    docker stop trace-test-postgres
    exit $?
  fi
fi

echo 'Usage: docker-trace.sh [start|stop]'
exit 1
