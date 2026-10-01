#!/bin/sh
# E2E stand-in for the cloudflared binary: answers --version and, for a quick
# tunnel, prints a fake trycloudflare URL and stays alive until killed.
if [ "$1" = "--version" ]; then
  echo "cloudflared version 0.0.0-e2e"
  exit 0
fi

echo "Your quick Tunnel has been created! Visit it at https://e2e-preview.trycloudflare.com" >&2
while true; do
  sleep 1
done
