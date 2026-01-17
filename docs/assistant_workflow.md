## Assistant Workflow Notes

This document defines recurring actions to perform automatically to improve
speed and accuracy. It is intended for future reference and should be updated
as needs evolve.

### Defaults for Repetitive Tasks
- After any code edit, run lints on modified files.
- If a build error is reported, fix the error and re-run the build.
- Prefer minimal, safe changes first; expand scope only if needed.
- Avoid conditional hook calls; check rules-of-hooks on React changes.
- Keep logging/diagnostic changes gated (query flag or env) to avoid noise.

### Diagnostics First
- When performance issues are reported, add timing logs at the client and
  server boundary to isolate the slow segment.
- Record measured timings and confirm which layer is slow before refactoring.

### NextAuth-Specific Checks
- Ensure NextAuth route handlers forward the correct arguments to `handler`.
- Avoid inflating session/JWT payloads unless necessary.
- Minimize `/api/auth/session` fetches on page load when possible.

### Documentation Location Policy
- Create future process documents under `/docs`.
- Prefer short, focused files with clear headings.
