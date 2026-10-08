---
name: OpenAPI path and query naming
description: A workspace-specific Orval export collision when one operation has both path and query parameters.
---

Adding query parameters to an operation that already has path parameters can generate a query TypeScript interface with the same export name as its Zod path-parameter schema.

**Why:** The Zod package re-exports both generated schemas and generated types. Orval can succeed while the chained library typecheck fails with duplicate-export errors.

**How to apply:** Check the generated export names when adding query parameters to a parameterized path. If the API semantics support distinct routes, a separate operation can avoid the ambiguity; otherwise change generator naming coherently and verify the library build. Never hand-edit generated output to hide the collision.
