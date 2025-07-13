# Touch Backend API

A simple **Node.js + Express** backend for the **Touch** React-Native social app.  
The repo ships with:

- **Express** HTTP server  
- **MongoDB** connection via **Mongoose**  
- **dotenv** for environment variables  
- **CORS** + JSON parsing middleware  
- A clean, feature-based folder layout (`/models`, `/controllers`, …)  
- Stubbed routes and controllers ready for implementation  
- **nodemon** dev workflow with graceful shutdown handlers  

---

## Table of Contents

1. [Prerequisites](#prerequisites)  
2. [Getting Started](#getting-started)  
3. [Environment Variables](#environment-variables)  
4. [Project Structure](#project-structure)  
5. [Available Scripts](#available-scripts)  
6. [Usage Examples](#usage-examples)  
7. [Common Questions](#common-questions)  
8. [License](#license)

---

## Prerequisites

| Tool | Version | Notes |
|------|---------|-------|
| **Node.js** | v16 or newer | Works on LTS 16/18/20 |
| **npm** or **yarn** | v8 or newer | Yarn ≥1.22 also fine |
| **MongoDB** | any 4.x/5.x/6.x | Local **or** Atlas |
| (optional) **nodemon** | latest | Hot-reload for dev |

```bash
npm install -g nodemon
```

---

## Getting Started

1. **Clone**

   ```bash
   git clone https://github.com/Comeback-2-0/Touch-Backend.git
   cd Touch-Backend
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Add `.env`**

   ```env
   # .env
   PORT=5000
   MONGO_URI=mongodb://localhost:27017/touch
   JWT_SECRET=paste_a_long_random_string_here
   ```

   > Never commit real secrets—`.env` is already git-ignored.

4. **Run in dev mode**

   ```bash
   npm run dev
   ```

   You should see:

   ```
   ✅ MongoDB connected
   🚀 Server running on port 5000
   ```

---

## Environment Variables

| Variable     | Required | Default | Description                     |
| ------------ | -------- | ------- | ------------------------------- |
| `PORT`       | No       | `3000`  | HTTP port                       |
| `MONGO_URI`  | Yes      | —       | MongoDB connection string       |
| `JWT_SECRET` | Yes      | —       | Secret used to sign/verify JWTs |

For multi-env setups (dev / staging / prod) you can combine **dotenv-flow** or your CI/CD secret manager; the code only expects `process.env.*`.

---

## Project Structure

```
project-root
├─ app.js                  # Express app (routes + middleware)
├─ server.js               # Entry point: connects DB, starts server
├─ config/
│  └─ db.js                # Mongoose connection helper
├─ models/                 # Mongoose schemas
│  ├─ User.js
│  ├─ Post.js
│  ├─ Community.js
│  ├─ Message.js
│  └─ Notification.js
├─ controllers/            # Route handlers (business logic)
│  ├─ userController.js
│  ├─ postController.js
│  ├─ communityController.js
│  ├─ messageController.js
│  └─ notificationController.js
├─ routes/                 # Express routers (REST endpoints)
│  ├─ userRoutes.js
│  ├─ postRoutes.js
│  ├─ communityRoutes.js
│  ├─ messageRoutes.js
│  └─ notificationRoutes.js
├─ middlewares/            # Reusable Express middleware
│  ├─ auth.js              # JWT verify (stubbed)
│  └─ errorHandler.js      # Centralised error formatting
├─ utils/                  # Helper scripts (e.g. seed.js, logger.js)
├─ .env.example            # Template env file
├─ .gitignore
└─ package.json
```

**Design choices**

| Folder        | Why it exists                                                |
| ------------- | ------------------------------------------------------------ |
| `models`      | One schema per collection → keeps data layer clean.          |
| `controllers` | Business logic separated from routing, easier unit tests.    |
| `routes`      | Thin routers just map HTTP verbs to controllers.             |
| `middlewares` | Auth, validation, error-handling plugged in per route.       |
| `utils`       | One-off scripts (seeding, cleanup) live here—keeps src lean. |

---

## Available Scripts

| Command        | Description                                              |
| -------------- | -------------------------------------------------------- |
| `npm run dev`  | Start server with **nodemon** (auto-reload on file save) |
| `npm start`    | Start server with vanilla `node` (production)            |
| `npm run seed` | (Optional) run `utils/seed.js` to populate test data     |
| `npm run lint` | If you add ESLint/Prettier later                         |

> All script names are in **package.json**—add more as the project grows.

---

## Usage Examples

> Endpoints are **stubbed**, returning “not implemented” JSON.
> Replace each stub in `controllers/*` with real DB logic.

### Health-check

```http
GET /              → 200 OK  "Touch API is running"
```

### Auth (flow coming soon)

```http
POST /api/users/register
Content-Type: application/json
{
  "email": "maya@example.com",
  "password": "hunter2"
}
```

Expected response after you implement it:

```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9…",
  "user": { "_id": "...", "email": "maya@example.com" }
}
```

### Posts

| Verb   | Route        | Controller    | Purpose                                     |
| ------ | ------------ | ------------- | ------------------------------------------- |
| `GET`  | `/api/posts` | `getAllPosts` | List posts (supports `?mood=` filter later) |
| `POST` | `/api/posts` | `createPost`  | Auth-required: upload new reel              |

### Communities + Messages

| Verb   | Route                        | Purpose                            |
| ------ | ---------------------------- | ---------------------------------- |
| `GET`  | `/api/communities`           | List all default communities       |
| `POST` | `/api/messages/:communityId` | Send a chat message to a community |
| `GET`  | `/api/messages/:communityId` | Fetch recent messages              |

Once JWT auth is wired, protect write endpoints like so:

```js
const auth = require('../middlewares/auth');
router.post('/', auth, postController.createPost);
```

---

## Common Questions

<details>
<summary>How do I enable CORS for my React-Native dev build?</summary>

Install & use `cors` in `app.js`:

```js
const cors = require('cors');
app.use(cors({ origin: '*' }));     // wide-open for dev
```

Lock it down in production.

</details>

<details>
<summary>Where should I put validation?</summary>

Use a middleware (e.g. `middlewares/validate.js`) with
[express-validator](https://express-validator.github.io):

```js
router.post(
  '/',
  auth,
  validate([
    body('mediaUrl').isURL(),
    body('mood').isIn(['happy','sad','stressed'])
  ]),
  postController.createPost
);
```

</details>

<details>
<summary>Is there a GUI to inspect the database?</summary>

Yep—install **MongoDB Compass** or connect your cluster to
[MongoDB Atlas](https://www.mongodb.com/atlas/database).

</details>


