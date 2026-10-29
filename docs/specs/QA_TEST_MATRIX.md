# QA Test Matrix

Record status as `TODO`, `IN PROGRESS`, `PASS`, or `BLOCKED`. Attach evidence for each `PASS`.

| ID | Area | Scenario | Expected result | Evidence |
|---|---|---|---|---|
| QA-001 | Startup | No saved locale | Indonesian is active | Test output |
| QA-002 | Startup | Valid saved English locale | English is active | Test output |
| QA-003 | Storage | Invalid stored locale | Safe Indonesian fallback | Test output |
| QA-004 | Settings | Select English | UI updates | UI test/screenshot |
| QA-005 | Persistence | Restart after selecting English | English persists | Restart test |
| QA-006 | Migration | Existing unrelated settings | Values preserved | Before/after comparison |
| QA-007 | Chat | New reply in Indonesian mode | Indonesian by default | Request + response capture |
| QA-008 | Chat | New reply in English mode | English by default | Request + response capture |
| QA-009 | History | Switch locale after prior messages | Existing messages unchanged | Storage comparison |
| QA-010 | Streaming | Switch locale between requests | No duplicate chunks/listeners | Integration test |
| QA-011 | Persona | Both locales | Identity/safety consistent | Fixture review |
| QA-012 | Explicit language | Ask for translation into another language | Explicit request honored | Test fixture |
| QA-013 | Image | Upload image in each locale | Analysis still works; reply uses active locale | E2E test |
| QA-014 | Clipboard | Paste image in each locale | Upload flow still works | E2E test |
| QA-015 | Search | Search/tool-assisted answer | Valid source/citations preserved | Integration test |
| QA-016 | Offline | Offline/local fallback | Active locale used where supported | Test output |
| QA-017 | UI catalog | Compare required keys | No missing required keys | Catalog audit |
| QA-018 | UI audit | English mode | No unintended Indonesian UI text | Audit report |
| QA-019 | UI audit | Indonesian mode | No unintended English UI text | Audit report |
| QA-020 | Layout | Long English strings | No unacceptable clipping | Screenshot/manual QA |
| QA-021 | Errors | Simulate failure states | User-facing error localized | UI test |
| QA-022 | Build | Existing production build | Pass or blocker documented | Build log |
| QA-023 | Packaging | Launch packaged app | Locale and settings persist | Manual/test log |
| QA-024 | Security | IPC and logs review | No new secret exposure or unsafe bridge | Review notes |

## Execution record

For each test, record:
- Commit SHA:
- Command or procedure:
- Environment:
- Result:
- Evidence location:
- Failure details or known limitation:
