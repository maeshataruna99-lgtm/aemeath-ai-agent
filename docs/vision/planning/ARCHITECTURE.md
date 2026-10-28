# Architecture Notes

## Proposed flow

```text
Renderer composer
  ├── text input
  ├── file picker
  ├── clipboard image paste
  └── preview / remove
          |
          v
Restricted preload API
          |
          v
Main-process IPC validation
  ├── payload schema
  ├── MIME/signature checks
  ├── size/dimension/count limits
  └── lifecycle / cleanup
          |
          v
Chat service
  ├── text-only path remains compatible
  ├── context/history policy
  └── contextual vision routing
          |
          v
Provider adapter
  ├── capability validation
  ├── documented multimodal payload
  ├── timeout / abort / errors
  └── secret redaction
          |
          v
Aemeath response → chat renderer
```

## Trust boundaries

- Renderer input is untrusted.
- MIME type declared by a client is not sufficient validation by itself.
- Image bytes may contain sensitive personal information.
- Prompt text and image content must not be treated as trusted system instructions.
- Provider responses and OCR output are untrusted content.
- API keys must not be exposed to renderer code or user-visible logs.

## Data lifecycle

Decisions required before implementation:
1. Maximum image count and byte size.
2. Supported image formats.
3. Whether images are held in memory only or temporarily persisted.
4. Whether follow-up turns can reference previous images.
5. Retention duration and reset behavior.
6. Disclosure language for external providers.
7. Behavior when the selected model does not support vision.

## Provider capability

Provider registry entries should expose or otherwise resolve capability information from verified configuration/documentation. Do not infer image support from provider name alone. Keep the provider-specific API payload separate from the app's internal attachment contract.

## Failure behavior

Every failure should:
- produce a stable, non-sensitive error code;
- avoid leaking keys or image bytes;
- release buffers and temporary resources;
- restore UI state;
- avoid appending a failed turn as a successful assistant response.
