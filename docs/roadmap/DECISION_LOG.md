# Decision Log — Bilingual Aemeath

## D-001: Supported languages
**Decision:** Support Bahasa Indonesia (`id-ID`) and English (`en-US`) in this milestone.  
**Reason:** Deliver complete bilingual behavior before adding more locales.

## D-002: Selector placement
**Decision:** The language selector appears in Settings only.  
**Constraint:** Do not add a duplicate language selector to the header.

## D-003: Default locale
**Decision:** If there is no valid saved preference, use Indonesian (`id-ID`).  
**Constraint:** Preserve a valid existing saved preference and unrelated settings.

## D-004: Conversation history
**Decision:** Changing locale does not translate, delete, reorder, or recreate existing messages.  
**Behavior:** New assistant responses use the active locale by default.

## D-005: Persona integrity
**Decision:** Keep Aemeath's stable identity, personality, and safety behavior consistent across locales.  
**Implementation direction:** Separate locale instructions from stable persona instructions where practical.

## D-006: Source of truth
**Decision:** Maintain one authoritative active locale and one preference persistence path, reusing existing application patterns.

## D-007: Evidence-based completion
**Decision:** A phase cannot be marked `PASS` without implementation evidence and executed verification results.

## Change control
Any change to these decisions must be recorded here with the date, rationale, affected acceptance criteria, and approval from the project owner.
