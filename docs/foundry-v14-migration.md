# Foundry V14 Migration Notes

This document tracks the changes between Foundry VTT v13 and v14 that are relevant to the Archivist Sync module, what was updated in the codebase, and what to retest before release.

## What changed in Foundry V14

### Core framework direction

V14 keeps `ApplicationV2` and `DocumentSheetV2` as the canonical application framework. There is no new "V3" paradigm. The main additions are:

- **Pop-out window support**: Any `ApplicationV2` instance can now be rendered in a separate browser window via `attachWindow()` / `detachWindow()`. This is a first-class feature added to the framework itself.
- **`AbstractSidebarTab` is a full `ApplicationV2` subclass**: In v14 the sidebar tab API is documented with V2 lifecycle methods (`_prepareContext`, `_renderHTML`, `_onActivate`, `_onDeactivate`). Legacy methods like `getData()` and `activateListeners()` are not part of the documented public API.
- **Public vs Private API enforcement**: The v14 docs formally distinguish `@public`, `@protected`, `@private`, and `@internal` methods. Modules should only call `@public` methods and only override `@protected` ones.
- **Font Awesome 7.2**: V14 ships with FA 7.2.0, so icon class names should be verified.

### Deprecation completions

V14 retired backward-compatible support for:

- `CONFIG.ActiveEffect.legacyTransferral` (deprecated since V11).
- A large set of V12-era deprecations (see [issue #13436](https://github.com/foundryvtt/foundryvtt/issues/13436)).
- The `-=` and `==` special operation keys on `DataModel#updateSource` are deprecated in favor of `DataFieldOperator` values.

### Manifest

The `ModuleManifestData` interface in v14 is largely unchanged from v13, but now explicitly types `type: "module"` as a required field and adds optional fields like `media`, `persistentStorage`, `quickstart`, and `protected`. Existing manifests that omit `type` should add it.

### Sidebar

- `Sidebar.TABS` registration is still the mechanism for adding custom tabs, but the tab class must be a proper `AbstractSidebarTab` subclass using V2 lifecycle.
- New `PlaceableDirectory` and `PlaceableTab` sidebar tabs were added to core.

### Measured Templates removal

V14 removes `MeasuredTemplate` as a document type, replacing it with region-based templates. This does not affect Archivist Sync (we don't use templates).

## What we changed

### Module manifest (`module.json`)

- Added `"type": "module"` field.
- Bumped `compatibility.minimum` to `14.359` and `compatibility.verified` to `14.359`.

### Cursor rules

- All `.cursor/rules/` files updated from v13 to v14 references, with corrected globs (`scripts/**` instead of `src/**`).
- Added `50-v14-sidebar-and-popouts.mdc` with sidebar tab and pop-out guidance.
- Added `60-v14-manifest-and-public-api.mdc` with manifest checklist and Public API guidance.

### Chat / sidebar refactor

- `AskChatSidebarTab` converted from legacy `getData()` / `activateListeners()` pattern to V2 lifecycle (`_prepareContext`, `_renderHTML`, `_onRender`).
- `AskChatWindow` converted from a plain helper class with manual DOM mounting to a proper `HandlebarsApplicationMixin(ApplicationV2)` implementation.

### Integration audit

- `DocumentSheetConfig.registerSheet` usage verified against v14 API (namespace is `foundry.applications.apps.DocumentSheetConfig`).
- jQuery compatibility branches in `archivist-sync.js` reviewed and cleaned up.
- Stale v13-specific comments removed throughout.

## What to retest

Before marking v14 compatibility as verified, smoke-test these flows:

1. **Module load**: The module activates without console errors on a fresh v14 world.
2. **Settings registration**: All settings appear in Module Settings and function correctly.
3. **World Setup wizard**: Complete flow from API key entry through campaign import.
4. **Journal sheet registration**: All custom sheets (Entry, PC, NPC, Item, Location, Faction, Recap) open correctly from the journal directory.
5. **Sync dialog**: "Sync with Archivist" button opens the dialog and reconciliation works.
6. **Sidebar chat**: The Archivist Chat tab renders in the sidebar, accepts input, streams responses, and handles clear/copy actions.
7. **Pop-out behavior**: Verify the sidebar chat tab can be popped out (v14 native feature) without breaking.
8. **Real-time sync**: Create/update/delete actors, items, journal entries and verify API calls fire correctly.
9. **Drag-and-drop linking**: Drop sheets onto each other and verify link creation in both Foundry and Archivist.
10. **Font Awesome icons**: Verify all FA icon references still render (FA 7.2 ships with v14).
