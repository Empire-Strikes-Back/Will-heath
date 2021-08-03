#!/bin/bash

repl(){
  clj \
    -X:repl deps-repl.core/process \
    :main-ns sportleafs.main \
    :port 7788 \
    :host '"0.0.0.0"' \
    :repl? true \
    :nrepl? false
}

main(){
  node src/sportleafs/cluster.js
  # node src/sportleafs/main.js
}

"$@"