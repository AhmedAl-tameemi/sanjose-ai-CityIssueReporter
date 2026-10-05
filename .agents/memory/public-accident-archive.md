---
name: Public accident database retention
description: Retention expectations when refreshing official City collision records.
---

Refreshes of the public accident database must preserve previously saved records rather than clearing the database before a source import or pruning rows simply because the rolling City dataset no longer returns them.

**Why:** The owner requested a database for listed accidents, not only a temporary map cache. The City's published dataset is a rolling historical window, and no deletion of saved history was requested. A source outage or incomplete import must not destroy existing saved data.

**How to apply:** Make complete imports atomic and repeatable. Keep the last successful records available during updates and source failures. Treat any future pruning or strict source-mirroring policy as a separate decision, and keep all public City records separate from private resident submissions.
