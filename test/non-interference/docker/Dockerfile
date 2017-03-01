FROM mongo:latest

# Setup node and npm
# From: https://github.com/GoogleCloudPlatform/nodejs-docker/blob/master/base/Dockerfile
RUN apt-get update -y && apt-get install --no-install-recommends -y -q curl python build-essential git ca-certificates && apt-get clean && rm /var/lib/apt/lists/*_*
RUN mkdir /nodejs && curl https://nodejs.org/dist/v0.12.7/node-v0.12.7-linux-x64.tar.gz | tar xvzf - -C /nodejs --strip-components=1
ENV PATH $PATH:/nodejs/bin
COPY google-cloud-trace-*.tgz /trace/

# Setup mongodb-core repository
RUN git clone --branch 1.2 https://github.com/christkv/mongodb-core.git --depth 1 /mongo
RUN sed -i 's#"use strict"\;#"use strict"\;require\("@google-cloud/trace-agent"\).start\(\)\;#g' /mongo/test/runner.js

# Run tests
RUN cd /mongo && npm install && npm install /trace/google-cloud-trace-*.tgz
