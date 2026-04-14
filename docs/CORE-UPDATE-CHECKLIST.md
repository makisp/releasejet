# Core Update Checklist

Follow this checklist for every release of the `releasejet` core package.

## Before Release

1. **Check plugin API surface** — Did any type in `src/plugins/types.ts` change? Did any hook payload shape change?

2. **If no plugin API changes** — Release normally. The Pro plugin continues working without any action.

3. **If plugin API changed (breaking):**
   - Bump `PLUGIN_API_VERSION` in `src/plugins/types.ts`
   - This is a **major version** bump for the core package (semver contract)
   - Coordinate a Pro release targeting the new API version
   - Update `peerDependencies` range in the Pro package's `package.json`

4. **If plugin API extended (non-breaking)** — New hooks or optional fields on existing payloads are fine within the same API version. This is a **minor version** bump.

## Release

5. **Run the full test suite** — `npm test`

6. **Run the build** — `npm run build`

7. **Tag and publish.**

## After Release

8. **If API changed** — Release the updated Pro plugin with matching compatibility.
