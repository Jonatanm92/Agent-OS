# Deadline Ledger — Privacy Policy draft

**Status: NOT FOR PUBLICATION YET.** Complete every `[OWNER FIELD]`, verify current provider/legal requirements, and obtain appropriate legal review before publishing.

Effective date: `[OWNER FIELD: EFFECTIVE DATE]`

Provider / legal entity: `[OWNER FIELD: LEGAL ENTITY NAME]`

Contact: `[OWNER FIELD: SUPPORT/PRIVACY EMAIL ON VERIFIED DOMAIN]`

Registered/business address: `[OWNER FIELD: ADDRESS IF REQUIRED]`

## 1. About Deadline Ledger

Deadline Ledger is a monday.com application for schedule change control. It reads Date and Timeline change activity on a monday board and lets authorized users attach governance context — such as a reason and reason category — to a specific deadline-change event.

This policy describes the information processed by Deadline Ledger and the technical services used to provide the application.

## 2. Information Deadline Ledger processes

### Board and activity information

When the Board View is opened, Deadline Ledger may process information made available through the monday API, including:

- monday account/board identifiers needed to scope the app
- board name
- item identifier and item name
- Date/Timeline column identifier and title
- previous Date/Timeline value
- new Date/Timeline value
- Activity Log event identifier
- monday user identifier associated with the deadline change
- activity timestamp
- user display name for attribution in the interface

This Activity Log information is used to render the current schedule-change ledger. v0.1 does not copy the full board Activity Log into an external customer database.

### Governance information entered by users

Deadline Ledger may persist:

- free-text deadline-change reason
- optional reason category
- monday user identifier that created the reason
- monday user identifier that most recently edited the reason
- reason creation timestamp
- reason update timestamp
- revision number

The reason is associated with the specific monday Activity Log event ID.

## 3. Where app data is stored

Deadline Ledger v0.1 stores governance information using monday.com's app storage (`monday.storage`). Records are namespaced by board ID.

v0.1 does **not** use an external customer-data database for board activity or reason records.

The application frontend is intended to be delivered through Netlify. The hosting/CDN provider necessarily processes ordinary web-request information needed to deliver static application files, such as network/device request metadata, under its own infrastructure and terms.

Deadline Ledger v0.1 does not intentionally transmit the customer's monday Activity Log or saved reason content to Netlify serverless functions, third-party analytics platforms, advertising systems or AI services.

## 4. Purposes of processing

Deadline Ledger processes the information described above to:

- display Date and Timeline changes
- show previous and new schedule commitments
- attribute schedule changes to monday users where the platform provides that information
- count repeated deadline changes
- identify deadline moves that have no explanation
- save and display user-entered reasons/categories
- maintain reason revision/attribution metadata
- operate, secure, troubleshoot and support the application

Final legal-basis language must be reviewed and completed for the provider's actual customer relationship and jurisdiction before publication.

## 5. Permissions requested from monday.com

v0.1 requests only the permissions required for its current feature set:

- `boards:read`
- `users:read`

v0.1 does not require `boards:write` to perform its current schedule-change audit/remediation workflow.

## 6. Artificial intelligence

Deadline Ledger v0.1 does not send customer board data or saved reasons to an AI model as part of the deployed product.

AI tools may be used internally during software development, but they are not part of the v0.1 customer data flow described in this policy.

## 7. Analytics and advertising

Deadline Ledger v0.1 does not include a third-party advertising SDK or third-party behavioral analytics SDK.

monday.com may receive platform-level app events required by its developer/Marketplace ecosystem, such as the documented `valueCreatedForUser` event when core application value is successfully created.

## 8. Retention

Deadline Ledger does not promise unlimited retention of monday Activity Log history. The Board View reads activity made available by monday at runtime and v0.1 bounds each refresh to the newest 5,000 Activity Log rows.

Governance reason metadata is stored in monday app storage according to monday's platform storage and application-lifecycle behavior.

The final published policy must be checked against the then-current monday Marketplace/storage documentation immediately before submission and must not promise an automatic deletion timeframe that has not been verified.

## 9. App uninstall/deauthorization

v0.1 does not maintain a separate external database containing customer board/reason records.

Information stored through monday app storage is subject to the monday platform's app-storage lifecycle. The provider will comply with the current monday Marketplace requirements applicable to app uninstall/deauthorization.

If future versions add external storage, the policy and deletion process must be updated before that version is released.

## 10. Service providers

The production release is expected to use at least:

- **monday.com** — application platform, API, authentication/platform context and app storage
- **Netlify** — static application hosting/CDN

The final public policy must list the actual production providers and relevant third-party domains/products used by the released application. Development-only services should not be represented as production processors unless they actually receive production customer data.

## 11. Security

Deadline Ledger is designed to minimize the data and permissions it requires. Technical measures include:

- read-only monday board/user scopes for v0.1
- no app secrets embedded in browser code
- HTTPS production hosting
- content-security and browser security headers on the planned production host
- optimistic storage versioning to reduce lost concurrent updates
- no external customer-data database in v0.1
- no customer board data sent to an AI service by the deployed product

No service can guarantee absolute security. The final public policy should include the provider's actual incident/security contact process.

## 12. International processing

monday.com and Netlify may process service data in locations governed by their respective infrastructure, contractual terms and data-transfer mechanisms.

`[OWNER FIELD / LEGAL REVIEW: add any provider-specific data-transfer disclosures required for the provider's customers and jurisdiction.]`

## 13. User/customer rights and requests

Questions or requests concerning privacy or data associated with Deadline Ledger should be sent to:

`[OWNER FIELD: PRIVACY/SUPPORT EMAIL]`

The provider will handle valid requests in accordance with applicable law and the provider's role in the relevant customer relationship.

`[OWNER FIELD / LEGAL REVIEW: finalize GDPR/data-subject/controller-processor wording as applicable.]`

## 14. Children

Deadline Ledger is a business productivity application and is not designed or marketed as a service for children.

## 15. Changes to this policy

The provider may update this policy when the application, service providers, legal obligations or data practices change. The published policy should identify its effective date and make material changes reasonably clear.

## Publication checklist

Do not publish until all are true:

- legal entity name finalized
- contact/privacy email finalized and matches any Marketplace domain-verification requirement
- address disclosure determined
- effective date set
- production hosting provider/domain verified
- third-party/service-provider list verified
- applicable legal-basis/controller-processor language reviewed
- international-transfer wording reviewed
- uninstall/storage lifecycle rechecked against current monday docs
- final URL is public HTTPS and uses the same entity name supplied to monday Marketplace review
