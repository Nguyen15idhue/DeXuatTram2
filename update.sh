#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

docker compose -f docker-compose.simple.yml up -d --build
echo "Da cap nhat. Xem log: docker compose -f docker-compose.simple.yml logs -f"
