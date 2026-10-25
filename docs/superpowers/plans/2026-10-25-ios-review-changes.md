# iOS Review Changes Implementation Plan

Goal: implement the user-requested deletion requests, post-only hiding under both labels, restricted Apple login, and communities-only tabs.

Execution: inline, as explicitly requested. No deployment or App Store submission.

- [x] Add tests for 14 weekday deadlines, durable/idempotent requests and email failure, pending account access, Apple email restrictions and linking, and persistent account-scoped post hiding.
- [x] Add user deletion-request storage for PostgreSQL/MongoDB, authenticated request endpoint, admin email delivery/retry, and pending-account access guards.
- [x] Add native Apple login and explicit linking using verified Firebase Apple credentials; reject missing email and private relay identities on the server.
- [x] Add mobile deletion screen with optional feedback, exact deadline and acknowledgement; add persistent post-only actions to community feed/detail/queue.
- [x] Restrict bottom navigation to Communities/Profile, update existing deletion/FAQ copy, and document Apple/Firebase/native build prerequisites and manual deletion operations.
- [x] Run backend/mobile suites, typecheck changed code, review diffs and report limits.

Constraints: Block User intentionally hides only the selected post, not an author. Do not describe it as satisfying Apple blocking rules. Apple relay rejection is intentional. Working days mean Monday-Friday, Asia/Kolkata, excluding weekends only. Actual deletion is performed manually by the administrator; no production data is deleted during implementation.


Verification: 20 focused mobile tests passed; 14 focused backend tests passed. Full backend: 213 passed, 1 unchanged community mapping expectation failed. Full mobile: 151 passed, 6 failures in unchanged CommunityPostCard, api URL, and splashResources tests. TypeScript and website assets passed. Native archive/device verification requires macOS and provisioning/Firebase setup. Code reviewer findings (Apple credential API and Settings initial route) fixed and covered by tests.
