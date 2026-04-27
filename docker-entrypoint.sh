#!/bin/sh
# Run-as-node entrypoint that prepares the uploads volume first.
#
# Railway mounts volumes with root ownership, but the app runs as the
# non-root `node` user (per the Dockerfile). Without this script, the very
# first write to UPLOADS_DIR fails with EACCES. We chown the directory once
# at boot, then drop privileges with su-exec.
#
# The `|| true` on chown is intentional — if there's no volume mounted (dev
# mode, or a deploy without UPLOADS_DIR set), we just skip and continue.

set -e

if [ -n "$UPLOADS_DIR" ] && [ -d "$UPLOADS_DIR" ]; then
  chown -R node:node "$UPLOADS_DIR" || true
fi

# Drop to the unprivileged node user and exec the real command.
exec su-exec node "$@"
