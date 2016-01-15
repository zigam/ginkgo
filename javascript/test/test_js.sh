#!/bin/bash

echo -n "names = " > names.js
cat ../../data/generated/names.json >> names.js
time jsc test_analyze_names.js
rm names.js
