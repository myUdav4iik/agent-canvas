---
title: Research Notes
tags: ["research", "index"]
created: 2026-06-29
---

# Research Notes

This folder contains notes gathered by the Researcher agent during runs.

Each run produces linked notes that can be navigated via [[wikilinks]].

## How it works

1. The **Researcher** agent uses `web_search` to find information
2. It writes structured notes to this folder using `vault_write`
3. Notes link to each other with `[[Note Title]]` syntax
4. The **Writer** agent reads these notes with `vault_read` to draft articles
5. All notes appear in the [[Graph View]] as an interconnected knowledge base
