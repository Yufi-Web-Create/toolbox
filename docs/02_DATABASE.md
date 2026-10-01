# Database Design

Status: DRAFT

Rules:
- Multi-tenant from day one.
- Tenant-owned business data must carry `organization_id` unless explicitly documented otherwise.
- Tenant access must be enforced with RLS.
- Database schema changes require an approved task.

Candidate tables:
- organizations
- profiles
- organization_members
- customers
- conversations
- messages
- templates
- knowledge_items
- posts
- post_destinations
- calendar_connections
- calendar_events

Detailed schema will be defined before implementation.
