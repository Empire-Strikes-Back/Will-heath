#!/bin/bash

main(){
  node src/sportleafs/cluster.js
  # node src/sportleafs/main.js
}

push(){
  ORIGIN=$(git remote get-url origin)
  rm -rf .git
  git init -b main
  git remote add origin $ORIGIN
  git config --local include.path ../.gitconfig
  git add .
  git commit -m "i am sportleafs program"
  git push -f -u origin main
}

"$@"