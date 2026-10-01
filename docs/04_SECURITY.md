# Security Requirements

1. Secrets must only exist in approved environment variables.
2. Never commit `.env` files containing real secrets.
3. No service-role secret in client code.
4. Tenant separation must be tested using at least two organizations.
5. Provider OAuth tokens must be stored securely and never logged.
6. Authentication and authorization failures must fail closed.
7. External API failures must not silently mark an operation successful.
8. Sensitive operations require explicit server-side authorization.
