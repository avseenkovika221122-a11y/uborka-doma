# Project handover

This repository has been migrated away from Firebase to a React + NestJS + PostgreSQL architecture.

Implemented in source:
- Email/password registration, email verification, login/logout, password reset and password change.
- Hashed passwords, hashed verification/reset/session/invite tokens, HttpOnly session cookies, API throttling and server-side authorization.
- Dynamic household groups, owner/member roles, invite codes, member removal, leave and owner succession.
- Monthly/weekly calendar, create/edit/delete tasks, assignment, completion history and score calculation.
- Socket.IO real-time refresh with server-side room membership checks and member revocation.
- Docker Compose, Nginx reverse proxy, optional Caddy TLS, PostgreSQL migration, backup/restore scripts.

Verification:
- TypeScript/TSX syntax transpilation passed for all 14 source files.
- Full `npm install`, Vite production build, Nest build, Prisma validation/migration and end-to-end tests were not run in this environment because package installation timed out and project dependencies are not installed here.
- No public deployment has been performed. A hosting account, domain/subdomain, SMTP credentials, and deployment secrets are required.

Before production:
1. Copy `.env.example` to `.env` and `backend/.env.example` to `backend/.env`; replace every placeholder.
2. Set the same PostgreSQL password in root `.env` and `backend/.env` `DATABASE_URL`.
3. Set `NODE_ENV=production`, `JWT_SECRET`, `APP_URL=https://SITE_DOMAIN`, and `CORS_ORIGIN=https://SITE_DOMAIN`.
4. Configure SMTP, DNS and server firewall (ports 80/443 only).
5. Run `docker compose -f docker-compose.yml -f docker-compose.production.yml up --build -d`.
6. Verify access from multiple Russian mobile and fixed networks; VPN-free availability cannot be guaranteed until the chosen hosting/network is tested.
7. Schedule `scripts/backup-db.sh` and periodically test `scripts/restore-db.sh` on a separate database.
