# Technical Requirements

## 1. Repository-first implementation
The coding agent must inspect the real source tree before selecting file paths, dependencies, APIs, or state-management patterns. Proposed folder structures in planning material are not assertions about existing files.

## 2. Locale model
Recommended initial type:

```ts
type AppLocale = "id-ID" | "en-US";
```

Use project conventions if another language or equivalent typed representation is already established. Validate values at storage and IPC boundaries.

## 3. Persistence
- Reuse existing application settings storage.
- Persist only supported locale values.
- Default to Indonesian when missing or invalid.
- Preserve unrelated settings.
- Avoid introducing a second store without a documented technical reason.
- Follow the app's existing Electron main/preload/renderer security boundaries.

## 4. Translation catalog
- Keep catalogs organized by locale.
- Prefer stable semantic keys, e.g. `settings.language.title`, over English sentence keys.
- Validate required-key parity in CI/tests.
- Define interpolation and pluralization conventions.
- Missing-key behavior must be visible in development and safe in production.
- Avoid concatenating sentence fragments that may need different grammar.
- Keep intentional exceptions documented.

Example only:

```json
{
  "settings": {
    "language": {
      "title": "Bahasa",
      "description": "Pilih bahasa aplikasi",
      "indonesian": "Bahasa Indonesia",
      "english": "English"
    }
  }
}
```

English catalog should use the same key shape, with English values.

## 5. UI localization
All in-scope strings must use the centralized translation API. Include labels, accessible names, placeholders, error states, tooltips, confirmations, loading states, and avatar dialogue. Audit dynamically generated strings and conditional branches too.

## 6. Chatbot locale propagation
- The active locale must be passed through the canonical request/context path.
- Keep persona identity and safety instructions intact.
- Apply locale instructions to normal and secondary response paths.
- Preserve user message content and stored message records.
- Do not translate tool output, source quotations, URLs, identifiers, or code blindly.
- Do not assume that changing the UI locale automatically changes a remote model's behavior; test the actual prompt/request path.
- Respect explicit user requests to translate or produce content in another language.

## 7. Electron security
- Use existing IPC and preload patterns.
- Validate locale values at process boundaries.
- Do not expose unrestricted filesystem, shell, or arbitrary IPC capabilities to the renderer.
- Do not leak provider credentials into UI logs or client-visible diagnostics.
- Do not add new permissions unless required and reviewed.

## 8. Compatibility
Test existing settings and stored chat history. Avoid destructive migrations. If schema changes are required, make them backward-compatible and document rollback or recovery behavior.

## 9. Testability
Prefer deterministic tests for locale resolution, catalog parity, persistence, prompt construction, and response-path propagation. For model-generated language, use both structural tests (locale instruction reaches request) and behavior tests with representative fixtures. Do not make test success depend on unstable exact wording unless the test uses a deterministic mock.

## 10. Dependencies
Do not add an i18n library until the agent has inspected existing dependencies and requirements. If adding one, document why it is needed, compatibility, bundle impact, and tests.
