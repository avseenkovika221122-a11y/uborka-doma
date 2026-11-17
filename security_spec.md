# Security Specification — Уборка дома

## Identity and sessions
- Email and password authentication only; passwords are stored using bcrypt hashes.
- Email verification and password-reset tokens are random, hashed at rest, and time-limited.
- Session JWTs are stored as SHA-256 hashes in PostgreSQL and delivered only through HttpOnly, SameSite=Lax cookies; Secure is enabled in production.
- Password reset and password change revoke all active sessions.

## Authorization
- Every protected REST endpoint checks the authenticated user.
- Group resources are accessible only to current group members.
- Only owners can rename groups, issue invitation codes, or remove other members.
- Membership is checked again before a Socket.IO client joins a group room.
- A group member cannot promote themselves to owner through public endpoints. Owner departure transfers ownership to the longest-standing remaining member, or deletes an empty group.

## Abuse protection
- Global API rate limit plus stricter per-route limits for registration, login, verification, and password reset.
- Invite codes use cryptographically secure random bytes; only SHA-256 hashes are stored.
- ValidationPipe rejects unknown fields and DTOs constrain key user inputs.
- Helmet security headers, CORS allow-list, and HTTPS are expected in production.

## Data protection
- User password hashes, reset tokens, verification tokens, and session tokens are never included in API responses.
- Group membership and task reads are scoped to group membership.
- PostgreSQL backups must be encrypted and stored separately from the primary host.
- Before public operation in Russia, the operator must complete the required personal-data notices, consent, processing purpose, retention, and localization review under applicable law.

## Remaining production operations
- Configure SMTP credentials and real public APP_URL/CORS_ORIGIN.
- Configure TLS termination and secure backups, restore drills, monitoring, log retention, and incident response.
- Verify accessibility from multiple Russian networks before advertising VPN-free availability.
