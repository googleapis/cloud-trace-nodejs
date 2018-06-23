#!/bin/bash

COMMIT=${COMMIT:-$(git rev-parse --short HEAD)}

$(npm bin)/typedoc --mode modules --excludeNotExported --excludePrivate --gitRevision $COMMIT --exclude "**/src/plugins/**" --out .docs src

if [ ! -z $REGEN_GH_PAGES ]; then
  git checkout -f gh-pages
  for X in $(ls .docs); do
    rm -r ./$X
    mv .docs/$X .
  done
  git add .
  git commit -m "doc: re-generate docs @ $COMMIT"
  # git push
fi
