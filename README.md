cat << 'EOF' > README.md
# API Drift Sentinel 🛡️

Prevent silent breaking API changes from sneaking into production.

API Drift Sentinel is a lightweight GitHub Action that compares OpenAPI/Swagger contracts between branches, detects breaking modifications (dropped fields, changed types, removed routes), and blocks PR merges automatically.

---

## Features

- **Zero Configuration:** Works out of the box with standard OpenAPI 3.0 / Swagger specs.
- **Merge Blocker:** Exits with status `1` and emits GitHub annotations when breaking changes are detected.
- **Fast Execution:** Pre-bundled JavaScript runner with zero runner-side dependency installation.

---

## Quickstart

Add this job to `.github/workflows/api-check.yml` in any repository:

```yaml
name: API Contract Gate

on:
  pull_request:
    branches: [ main ]

jobs:
  check-api-drift:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout PR Branch
        uses: actions/checkout@v4

      - name: Fetch Baseline Spec from Main
        run: |
          git fetch origin main:main
          git show main:openapi.json > baseline-openapi.json

      - name: Run API Drift Sentinel
        uses: Turya-Kalburgi/api-drift-sentinel@v1
        with:
          base-spec: 'baseline-openapi.json'
          head-spec: 'openapi.json'