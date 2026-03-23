# AGENTS.md

## Cursor Cloud specific instructions

### Overview
WhatsApp Sales Assistant ("Asistente de Ventas WhatsApp") — a Python/Flask app that automates sales prospecting via WhatsApp Web using Playwright for browser automation and SQLite for storage. All in Spanish.

### Services

| Service | Command | Port/Notes |
|---|---|---|
| Flask web dashboard | `python3 app.py` | http://localhost:5000 |
| WhatsApp bot | `python3 bot.py` | Requires real WhatsApp account + QR scan; not runnable in CI |
| CLI management | `python3 cli.py <subcommand>` | Interactive — use subcommands (`stats`, `list`, etc.) to avoid TTY prompts |

### Dependencies
- Python 3.12, Flask, Playwright (see `requirements.txt`)
- Playwright Chromium must be installed: `python3 -m playwright install --with-deps chromium`

### Key notes
- No linter or test suite exists in the repo. There are no unit tests, no `pytest`, no `flake8`/`ruff` config.
- The database (`data/prospectos.db`) is auto-created on first import of `database.py`.
- `data/config.json` ships with the repo and contains business configuration.
- `bot.py` requires a real WhatsApp session (QR scan) — it will not fully function in headless cloud environments without a paired phone.
- The Flask app (`app.py`) works standalone without the bot running; it provides full CRUD for prospects, message previews, and configuration.
- `cli.py` without arguments launches an interactive menu (blocks on TTY input). Use `python3 cli.py stats` or `python3 cli.py list` for non-interactive usage.
- The web app and bot communicate through shared JSON files in `data/` (state, logs, flags).
- `PATH` may need `$HOME/.local/bin` prepended if pip installs to user site-packages.
