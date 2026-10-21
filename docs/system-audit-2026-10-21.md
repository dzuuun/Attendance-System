# System audit — 21 October 2026

Scope: local application source, authentication and maintenance permissions, ID/card resolution, enrollment flows, attendance and kiosk paths, user management, academic periods, automated checks, and aggregate checks against the configured database. This is a code and data-integrity review, not a penetration test or certification of the deployed network.

The initial audit used isolated fixtures and mocked persistence. Database inspection used SELECT queries only; it did not create users, enroll cards, change periods, or record attendance.

## Remediation status — all six findings addressed

Implemented in the workspace on 21 October 2026. The original findings below are retained as the audit baseline.

| Finding | Implemented protection |
| --- | --- |
| ID/card conflicts | Shared identifier validation and a database lock shared with card enrollment cover student, employee, and alumni creation/editing, graduation, bulk graduation, and SQL Server imports. Linked student/alumni official IDs remain supported. Scans reject ambiguous matches instead of selecting a different person. |
| Cross-directory exports | The person-log controller checks the permission for the requested person type before reading personal data, across all four log sources. |
| Current-period loss | Period changes lock the period rows, validate the target first, and roll back failed updates. Concurrent selections preserve one current period. |
| Administrator User management | A user-management permission-options endpoint returns only roles the actor may assign. Permission administration stays restricted to Superadmin. The page handles loading failures visibly. |
| Password-reset sessions | A successful administrative password reset revokes the target user's sessions. Invalid target IDs are rejected, and profile-only changes preserve sessions. |
| Student enrollment race | Students now use the same shared enrollment dialog as employees and alumni. Pending saves disable scanning/submission and prevent closing or changing the selected person. |

Remediation validation:

- 49 automated tests pass, including cross-table conflicts, concurrent ID/card assignments, valid creation and graduation, import rollback, the complete directory/source permission matrix, period rollback/concurrency, permission options, and rejection of old tokens after password resets.
- All seven browser scripts pass: enrollment-only, all three people directories, user-management success/failure, entrance scanning, library/Internet Section scanning, pairing, and toast behavior.
- 138 JavaScript files pass syntax checks.
- The identifier query was also exercised in a read-only database transaction: existing student/employee IDs were accepted for their owners and rejected for different people. No production records were modified by verification.
- No new database migration is required; the fixes use existing columns and tables.

The toast fixture now uses the same Chrome compatibility flags as the other browser checks. Dependency advisory verification remains unavailable as described in the original audit.

## Original confirmed findings

### 1. P1 — Creating or editing a person can make another person's card resolve to the wrong person

References: `api/maintenance/student/student.model.js:70`, `api/maintenance/employee/employee.model.js:104`, `api/attendance/attendance.model.js:271`.

Card enrollment checks whether a card conflicts with IDs and cards across all three person tables. Ordinary ID-number creation and editing do not enforce the inverse rule. Student validation checks employee ID numbers but omits employee card IDs; employee validation omits card IDs entirely and does not cover alumni. Imports also need the same protection.

Reproduction: an existing fixture employee had an enrolled card. Creating a student whose ID number equaled that card returned HTTP 201. Resolving the employee's physical card through the real attendance lookup then returned the newly created Student, because the lookup prefers student matches. The reproduction used real controller/model code with in-memory database replies.

Impact: attendance can be attributed to a different person even though the original card was enrolled correctly. The individual table indexes cannot prevent this cross-table conflict.

Fix: enforce one shared identifier-conflict policy for every person ID and card write, including imports, with serialization or a database-backed identifier registry. Preserve explicitly permitted student/alumni links while rejecting ambiguous matches between different people. Reject ambiguous lookup results instead of silently choosing a person type.

### 2. P1 — Person-log exports bypass the selected directory permission

References: `index.js:349`, `api/person_logs/person_logs.controller.js:35`.

The person-log route accepts any one of students, alumni, or employees maintenance access. Its controller accepts the person type from the URL without checking access to that particular directory.

Reproduction: the real router and authorization middleware returned HTTP 200 and fixture Student logs to a user whose only maintenance module was employees. The request was `/api/person-logs/student/7?academicPeriodId=1&source=library`.

Impact: an operator restricted to one directory can retrieve other directories' attendance records and identifying information.

Fix: authorize the requested person type before reading the person or logs. Add negative access tests for every directory combination and all log sources.

### 3. P1 — A failed academic-period update can leave no current period

References: `api/maintenance/academic_period/academic_period.model.js:87`, `api/maintenance/academic_period/academic_period.controller.js:43`.

When isCurrent is true, the model first clears all current-period flags. Updating a nonexistent target ID then affects zero rows, but the transaction commits before the controller returns HTTP 404.

Reproduction: updating fixture period 999999 as current returned 404 while committing the removal of the existing current-period flag.

Impact: subsequent attendance writes have no current academic period and fail until a valid period is selected or initialization repairs the state. This affects entrance, event, library, and Internet Section recording.

Fix: lock and validate the target before clearing the existing flag; roll back if the target update does not affect a row. Keep the current-period invariant inside the transaction.

### 4. P2 — Administrators cannot load User management

References: `index.js:465`, `index.js:466`, `client/user/user_management/script.js:112`.

The user-management page loads users and permissions together with Promise.all. Users access permits the users request, but the permissions list requires the Superadmin role. An Administrator therefore receives HTTP 403 for a request required to render the page. The startup promise has no error handler.

Evidence: the real requireSuperadmin guard denied an Administrator with usersAccess; source inspection confirms that failure aborts the initial render.

Impact: authorized administrators cannot load the user table or permission choices needed to manage non-administrator accounts.

Fix: provide a permission-options read endpoint for authorized user managers, filtering assignable roles. Keep permission mutation restricted to Superadmin and handle startup failures visibly.

### 5. P2 — An administrator password reset leaves existing sessions valid

References: `api/user/user_management/user_management.controller.js:125`, `auth/auth_validation.js:58`; compare `api/login/login.controller.js:231`.

Self-service password changes revoke the user's sessions. Administrative password resets update the hash without revoking sessions. Authentication checks the stored session and current account permissions, but does not compare the session with a password-change version.

Reproduction: a valid administrative reset returned HTTP 200 and wrote the new password hash without invoking session revocation. The existing session rows remain eligible for authentication.

Impact: someone already holding a session can remain signed in after an administrator resets the password, until revocation, account deactivation, or the normal eight-hour expiration.

Fix: revoke the target user's sessions whenever an administrator changes that user's password. Add a test proving that the old token is rejected afterward.

### 6. P2 — Switching students during an enrollment save can display the card under the wrong student

References: `client/maintenance/student/script.js:371`, `client/maintenance/student/script.js:561`.

The student directory allows closing the enrollment modal during a pending save. The completion handler writes to the mutable global cardStudent rather than the person captured when the request began. The employee/alumni shared dialog already prevents this switch while saving.

Browser reproduction using the actual student click and submit handlers: start saving for student 1, close the modal, open student 2, then resolve the first request. The request correctly targeted `/api/student/1/card`, but the in-memory student 2 received the returned card ID and the second student's modal closed. Student 1's in-memory status stayed unchanged.

Impact: the table shows misleading enrollment status and interrupts the next student's enrollment. This reproduction does not demonstrate an incorrect database assignment; the request itself targeted the correct student.

Fix: use the shared enrollment dialog for students as well, or capture the selected person locally, block duplicate submissions, and prevent changing or closing the enrollment while saving. Apply the result only to that captured record.

## Initial audit validation results

- `npm test`: 36 tests passed. The confirmed findings above are not covered by the current success-path and permission tests.
- `npm run check`: 134 JavaScript files passed syntax checks.
- Enrollment-only, employee/alumni enrollment, entrance kiosk, library/Internet Section kiosk, and kiosk pairing browser scripts passed unchanged.
- The toast browser script did not produce a report with its default Chrome flags. Running the same fixture with `--no-sandbox --in-process-gpu` passed all toast assertions. This is a test-environment limitation, not evidence of a broken toast UI.
- Aggregate database inspection found 4,562 students, 2 employees, and 0 alumni. All three card_id columns exist, exactly one academic period is current, and there are no active cross-person card collisions or log rows with invalid student/employee identity combinations. These checks describe the inspected snapshot, not protection against future invalid writes.
- `npm audit --omit=dev --json` could not retrieve registry advisories. Dependency vulnerability status remains unverified.

## Remaining limits

No physical HID reader, Android device, Google Workspace account, network infrastructure, backup restoration, or sustained concurrent production load was exercised. Database data inspection used aggregates, not a review of individual personal records. The deployed server process was not restarted or changed.
