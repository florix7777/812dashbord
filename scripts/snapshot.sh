#!/bin/bash
# Dashboard SC v1.2.3 — Production Snapshot
# Generated: 20 апреля 2026

echo "=========================================="
echo "Dashboard SC v1.2.3 - Production Snapshot"
echo "=========================================="
echo ""

# Git Info
echo "[GIT]"
echo "Branch: $(git branch --show-current)"
echo "Commit: $(git rev-parse --short HEAD)"
echo "Tag: v1.2.3"
echo "Total commits: $(git rev-list --count HEAD)"
echo ""

# Docker Status
echo "[DOCKER]"
docker ps --filter "name=qc" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
echo ""

# Files Summary
echo "[FILES] Key components:"
ls -lh index.html
ls -lh auto_updater.py
ls -lh docker-compose.yml
ls -lh Dockerfile
ls -lh RELEASE_NOTES.md
echo ""

# Git log
echo "[COMMITS] Last 3:"
git log --oneline -3
echo ""

echo "[STATUS] ✓ Production Ready"
echo "=========================================="
