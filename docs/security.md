# Security / Hardening Documentation

The AnyClick platform, by its nature, interacts with external web content and operates a powerful browser automation engine. This introduces significant security considerations that must be carefully addressed during deployment and operation. This document outlines critical operational concerns and provides recommended deployment guidance to ensure a secure and hardened environment.

## Operational Concerns

### 1. Browser-Control Endpoints are Powerful

*   **Risk**: The server's API endpoints that control browser actions (e.g., `click`, `type`, `navigate`) are highly privileged. Unauthorized access could allow malicious actors to perform arbitrary actions on any website, potentially leading to data exfiltration, unauthorized transactions, or abuse of web services.
*   **Mitigation**: These endpoints **must** be protected with robust authentication and authorization mechanisms.

### 2. Dashboard/Helper HTML Rendering (XSS)

*   **Risk**: If the **planned** Dashboard (or current basic UI) renders user-provided input or raw content from external web pages without proper sanitization, it could be vulnerable to Cross-Site Scripting (XSS) attacks. A malicious script injected via a flow definition or scraped data could compromise the user's browser session or access sensitive data.
*   **Mitigation**: All user-generated content and external web content displayed in the **planned** Dashboard (or current basic UI) **must** be rigorously sanitized to prevent script injection.

### 3. Logs and Memory May Contain Sensitive Information

*   **Risk**: AnyClick's logging and memory features (recipes, run histories, fingerprints) may inadvertently capture sensitive data, such as login credentials, personal identifiable information (PII), or confidential business data, especially during human-in-the-loop recovery or debugging.
*   **Mitigation**: Implement **strict data redaction** for logs and memory storage. Sensitive fields should be masked or encrypted. Users should be educated on the types of data that might be captured.

### 4. Limited Session Isolation (Current Behavior)

*   **Current State**: The current AnyClick server operates a single, global Playwright browser context. All incoming requests effectively share this browser instance. While logical `sessionId`s are tracked, there is no strong isolation at the browser or page level between concurrent automation tasks.
*   **Risk**: In a multi-tenant or shared environment, inadequate session isolation could lead to data leakage between concurrent automation tasks or accidental interference with another task's browser state (e.g., cookies, local storage, active page). A global browser instance or shared profile could inadvertently expose one automation's browsing context to another.
*   **Recommended Future Direction**: For robust, concurrent, and secure automation, it is **recommended** that each automation session (or at least each concurrent execution) operates within a strictly isolated Playwright browser context or user data directory. This prevents cross-contamination and ensures deterministic execution.

## Recommended Deployment Guidance

To harden the AnyClick deployment and protect against common vulnerabilities, the following measures are strongly recommended:

### 1. Authentication

*   **Implement Strong Authentication**: All API endpoints, especially those controlling browser actions or sensitive data, **must** be secured with strong authentication (e.g., API keys, OAuth2, JWTs).
*   **Role-Based Access Control (RBAC)**: Implement RBAC to ensure that only authorized users or services can access specific functionalities.

### 2. Reverse Proxy

*   **Deploy Behind a Reverse Proxy**: Place the AnyClick server behind a reverse proxy (e.g., Nginx, Apache, Caddy). This provides an additional layer of security and allows for:
    *   **SSL/TLS Termination**: Encrypting all traffic between clients and the server.
    *   **Request Filtering**: Blocking malformed or suspicious requests.
    *   **Load Balancing**: Distributing traffic in high-availability scenarios.

### 3. Request Limits

*   **Enforce Request Payload Limits**: Configure the server and reverse proxy to enforce strict limits on the size of incoming request payloads to prevent denial-of-service attacks or excessive memory consumption.

### 4. CORS (Cross-Origin Resource Sharing)

*   **Configure Strict CORS Policies**: Implement a strict CORS policy on the AnyClick server to only allow requests from trusted origins (e.g., the **planned** Dashboard's domain, n8n instance). This prevents unauthorized web applications from making requests to your API.

### 5. Rate Limiting

*   **Implement API Rate Limiting**: Apply rate limiting to all API endpoints (either at the reverse proxy level or within the application) to prevent abuse, brute-force attacks, and resource exhaustion. This limits the number of requests a single client can make within a given timeframe.

### 6. Logging Redaction

*   **Automated Sensitive Data Redaction**: Implement automated processes to redact or mask sensitive information (e.g., passwords, API keys, PII) from all application logs *before* they are written to persistent storage. This is crucial even with secure logging systems.

### 7. Principle of Least Privilege

*   **Run with Least Privilege**: Ensure the AnyClick server process runs with the minimum necessary operating system privileges.
*   **Secure File Permissions**: Configure strict file system permissions for data directories (`browser-worker/data/`) to prevent unauthorized access to stored memory (recipes, fingerprints, audit logs).

By diligently implementing these security and hardening measures, AnyClick can be deployed and operated as a robust and trustworthy browser automation platform, with **planned** enhancements for stronger session isolation.