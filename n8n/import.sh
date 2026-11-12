#!/bin/sh
# Loads credentials and workflows into n8n. Import leaves workflows unpublished,
# so each one is published by id, sub-workflows first.
set -eu

RUNTIME_DIR="${RUNTIME_DIR:-/runtime}"
WORKFLOW_DIR="${WORKFLOW_DIR:-/workflows}"

n8n import:credentials --input="$RUNTIME_DIR/credentials.json"
n8n import:workflow --separate --input="$WORKFLOW_DIR"

for id in LendLoopSigned01 LendLoopVerify01 LendLoopErrors01 LendLoopEvent001 LendLoopOverdue1; do
  n8n publish:workflow --id="$id"
done
