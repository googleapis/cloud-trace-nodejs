#!/bin/bash

# Install framework deps
for dir in build/test/plugins/fixtures/*/ ;
do
  echo -en "travis_fold:start:npm_install_${dir}\\r" | tr / _
  pushd "${dir}" > /dev/null
  if [ -d 'node_modules' ] ; then
    echo "Skipping npm install in ${dir} since node_modules already exists"
  else
    echo "npm install in ${dir}"
    npm install || exit 1
  fi
  popd > /dev/null
  echo -en "travis_fold:end:npm_install_${dir}\\r" | tr / _
done
