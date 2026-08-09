# Generated database types

This directory is the stable output boundary for Supabase-generated database types once the application package and import boundary exist.

Generate from the clean isolated local database with:

```powershell
supabase gen types typescript --local --schema public > supabase/types/database.types.ts
```

Generated output must be reproduced after every schema migration, reviewed as generated code, and never edited by hand. Phase 3 does not commit the TypeScript artifact because no application/package boundary exists yet.
