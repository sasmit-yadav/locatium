# Multi-architecture PostGIS image for Oracle Ampere (arm64) and local amd64.
FROM postgres:16-bookworm

RUN apt-get update \
    && apt-get install -y --no-install-recommends postgis postgresql-16-postgis-3 \
    && rm -rf /var/lib/apt/lists/*
