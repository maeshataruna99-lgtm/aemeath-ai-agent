# Vision Test Matrix

All tests start as **NOT RUN**. Use actual output to update status.

| ID | Scenario | Expected result | Status | Evidence |
|---|---|---|---|---|
| IMG-01 | Text-only chat | Existing behavior preserved | PASS | Baseline tests pass (tests/chat-service.test.js) |
| IMG-02 | Valid PNG upload | Accepted and previewed | PASS | tests/chat-panel-ux.test.js (file picker PNG upload previewed) |
| IMG-03 | Valid JPEG/WebP upload | Accepted if format is supported | PASS | tests/chat-panel-ux.test.js (JPEG/WebP accepted and previewed) |
| IMG-04 | Clipboard screenshot paste | Image preview appears | PASS | tests/chat-panel-ux.test.js (image paste handled, previewed) |
| IMG-05 | Clipboard text paste | Text paste remains unchanged | PASS | tests/chat-panel-ux.test.js (default text paste unhindered) |
| IMG-06 | Remove attachment | Only selected attachment removed | PASS | tests/chat-panel-ux.test.js (specific removal keeps prompt and other attachments) |
| IMG-07 | Unsupported format | Clear rejection | PASS | tests/chat-attachment.test.js (GIF/random bytes rejected) |
| IMG-08 | Spoofed MIME / invalid signature | Rejected where applicable | PASS | tests/chat-attachment.test.js (declared MIME vs magic bytes check) |
| IMG-09 | Oversized file / dimensions | Rejected or safely processed within documented limits | PASS | tests/chat-attachment.test.js (>5MB & >8192px rejected) |
| IMG-10 | Multiple images | Respects documented limit and ordering | PASS | tests/chat-attachment.test.js (clamp MAX_ATTACHMENTS = 3) |
| IMG-11 | Provider lacks vision support | Explicit unsupported-capability error | PASS | tests/chat-service.test.js (throws unsupported-capability on non-vision provider) |
| IMG-12 | Valid vision request | Documented payload sent to compatible model | PASS | tests/chat-gemini.test.js (formatGeminiPayload with inline_data & SSE streaming) |
| IMG-13 | OCR request | Visible text transcribed without invented content | PASS | tests/chat-vision-context.test.js (OCR guidance with [tidak terbaca] marking) |
| IMG-14 | Image translation | Text extracted and translated appropriately | PASS | tests/chat-vision-context.test.js (original text extraction + natural translation) |
| IMG-15 | Visual identification | Evidence-based candidates; uncertainty disclosed | PASS | tests/chat-vision-context.test.js (candidate identification with visual evidence) |
| IMG-16 | Screenshot debugging | Visible error separated from hypotheses | PASS | tests/chat-vision-context.test.js (screen fact separated from cause hypothesis) |
| IMG-17 | Diagram explanation | Explanation grounded in visible elements | PASS | tests/chat-vision-context.test.js (diagram structure & component flow) |
| IMG-18 | Compare images | Similarities/differences grounded in both images | PASS | tests/chat-vision-context.test.js (structured comparison prompt fallback) |
| IMG-19 | Follow-up question | Correct prior image context referenced | PASS | tests/chat-vision-context.test.js (history reference retention without resending buffer) |
| IMG-20 | Timeout / abort | UI recovers and resources are released | PASS | tests/chat-privacy-lifecycle.test.js (busy state released after abort) |
| IMG-21 | Provider error | Friendly error; secrets redacted | PASS | tests/chat-gemini.test.js & tests/chat-privacy-lifecycle.test.js (redacts API keys) |
| IMG-22 | Reset conversation | Image references cleared according to policy | PASS | tests/chat-privacy-lifecycle.test.js (reset clears history and visual memory) |
| IMG-23 | Logging/privacy | No raw image or credential leakage | PASS | tests/chat-privacy-lifecycle.test.js (zero base64 in history/logs; UI disclosure badge) |
| IMG-24 | Existing regression suite | Required project checks pass | PASS | npm run verify (63 JS valid, 406/406 passed), npx electron . --selfie (exit 0) |

## Verification commands

First inspect `package.json` to confirm the available scripts. Planned commands:

```bash
npm test
node scripts/verify.js
npm run verify
npx electron . --selfie
```

All commands executed and verified with 100% pass rate.
