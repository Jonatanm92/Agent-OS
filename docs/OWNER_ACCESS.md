# Owner Access — Local Authentication

Hermes Oracle Company OS permits read-only status views without a credential, but every mutating API action is owner-gated. Chat, settings changes, project creation, pipeline execution, file writes, orchestration, model changes, and other state-changing operations require `AGENT_OS_PASSWORD` plus a successful browser login.

## Start an authenticated local session

Open PowerShell in the reviewed Agent OS repository and run:

```powershell
.\scripts\set-owner-password.ps1
```

Enter a local password containing at least 16 characters. The helper:

- reads the password through PowerShell's secure prompt
- does not place it in command history
- sets `AGENT_OS_PASSWORD` only for the current PowerShell process
- does not write the password to Git, `.env`, Windows user settings, or the repository

Start the Company OS from the **same PowerShell window**:

```powershell
powershell -ExecutionPolicy Bypass `
  -File .\scripts\company-runtime.ps1 `
  -Action start `
  -OpenDashboards
```

When the Owner Cockpit opens, enter the same password. The browser stores the returned local token under the Agent OS origin. The server compares it with the process-only owner password before allowing a state-changing request.

## Confirm the gate

Public health remains available:

```powershell
Invoke-WebRequest http://127.0.0.1:3001/api/health -UseBasicParsing
```

Authentication status:

```powershell
Invoke-RestMethod http://127.0.0.1:3001/api/auth/status
```

Expected result after the password is configured:

```text
required : True
```

A mutating request without the browser token must return `401 unauthorized`. Starting the server without `AGENT_OS_PASSWORD` leaves mutating routes blocked with an owner-gate error; it does not silently create an unauthenticated write mode.

## End or rotate the local session

Stop the Agent OS process before clearing or changing the password.

Remove the process-only value:

```powershell
.\scripts\set-owner-password.ps1 -Clear
```

To rotate it:

1. stop Agent OS
2. clear the old process value
3. run `set-owner-password.ps1` again
4. restart Agent OS from the same PowerShell window
5. clear the browser's `agentos_token` local-storage entry or use a private browser window
6. log in with the new password

Closing the PowerShell window also removes the process-scoped environment value.

## Security boundary

This password protects the local Agent OS API. It is not a replacement for:

- Windows account security
- full-disk encryption
- provider API-key protection
- Paperclip authentication
- Tailscale access control
- customer-system credentials
- production deployment controls

Keep Agent OS and Paperclip bound to loopback. Do not expose either service through a public port. Remote access should use a separately authenticated private network and should be reviewed before enabling any external reachability.
