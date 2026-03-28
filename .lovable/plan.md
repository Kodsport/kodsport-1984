

## Plan: Disable Email Verification (Auto-Confirm Signups)

### What changes
- Enable auto-confirm for email signups so users can sign in immediately without verifying their email
- This eliminates the "email rate limit exceeded" problem entirely

### How
1. Use `cloud--configure_auth` to enable `autoconfirm` for email signups
2. No code changes needed — the signup flow already handles the post-signup state correctly

### Tradeoff
- Users can sign up with any email (including fake ones) without verification
- Can be re-enabled later when rate limits are no longer a concern

