# Backend API

NestJS API with PostgreSQL/Prisma and Socket.IO. All endpoints use `/api` prefix.

## Development

```bash
cp .env.example .env
npm install
npx prisma generate
npx prisma migrate dev --name init
npm run dev
```

Run PostgreSQL from the repository root with `docker compose up -d db` (or run the full stack with Docker Compose).

## Routes

- `POST /api/auth/register`, `POST /api/auth/verify-email`, `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`
- `POST /api/auth/password-reset/request`, `POST /api/auth/password-reset/confirm`, `POST /api/auth/password/change`
- `GET/POST /api/groups`, `POST /api/groups/join`, `POST /api/groups/:id/invite`, `POST /api/groups/:id/leave`, `PUT /api/groups/:id`, `DELETE /api/groups/:id/members/:userId`
- `GET/POST /api/groups/:groupId/tasks`, `PUT/DELETE /api/groups/:groupId/tasks/:taskId`, `POST /api/groups/:groupId/tasks/:taskId/completion`, `GET /api/groups/:groupId/rating`

Socket.IO namespace `/updates`; browser session cookie authenticates the socket, and membership is verified server-side on `group:join`.
