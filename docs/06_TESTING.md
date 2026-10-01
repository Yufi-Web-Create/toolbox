# Testing Policy

## Required categories
- Unit tests where appropriate
- Integration tests for auth/database boundaries
- Tenant-isolation tests
- Build/type/lint checks
- Manual acceptance tests for critical flows

## Authentication release gate
Must verify:
- Sign up
- Email verification if enabled
- Login
- Logout
- Session persistence
- Session refresh
- Protected-route rejection
- Password reset
- Organization membership
- Cross-tenant access denial
- No browser exposure of service-role secrets
- Production build passes

No later product phase begins until the current gate passes.
