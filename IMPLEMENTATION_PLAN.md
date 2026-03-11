# **Implementation Plan: Upgrade Tron Web3 Library to EVM Architecture**

## **Analysis Summary**

**Current Tron Architecture:**
- 5 separate classes: `TronProvider` → `RequestHandler` → `FlutterTunnel` → `BaseTunnel` + `EventEmitter`
- Message types: `"request"`, `"response"`, `"notify"`
- Unified message channel (all via `window.addEventListener("message")`)
- Metadata: Full site metadata (title, description, colors, computed styles)
- UUID: Custom simple generator
- No dual mode support (Flutter only)
- Provider discovery: `TIP6963:announceProvider` event

**Target EVM Architecture:**
- Single class: `BearbyProviderImpl` (all-in-one)
- Message types: `"BEARBY_REQUEST"`, `"BEARBY_RESPONSE"`, `"BEARBY_EVENT"`
- Hybrid channel: responses via `window.addEventListener("message")`, events via `window.handleBearbyEvent`
- Metadata: Minimal (meta tags only + favicon)
- UUID: `uuidv4()` with `crypto.randomUUID()` fallback
- Dual mode: Flutter + Extension (DOM events)
- No provider discovery (will be removed)

---

## **Step-by-Step Implementation Plan**

### **Phase 1: Create Core Utilities (Reuse from EVM)**
**Files to create:**
- `src/uuid.ts` - Add `uuidv4()` function
- `src/favicon.ts` - Add `getFavicon()` function
- `src/meta.ts` - Add `getMetaDataFromTags()` function

**Details:**
- Copy exact implementations from EVM library
- Remove old `getSiteMetadata()` from `utils.ts` (will be unused after migration)
- Keep `rgbToHex()` if needed elsewhere, otherwise remove

---

### **Phase 2: Refactor Main Provider (Biggest Change)**
**File:** `src/bearby-provider.ts` (NEW FILE)

**Transformation:**
1. **Create class** `BearbyProviderImpl`
2. **Remove dependencies** on `RequestHandler`, `FlutterTunnel`, `BaseTunnel`
3. **Add properties:**
   - `#isFlutterMode: boolean` (detect via `window.flutter_inappwebview`)
   - `#eventListeners: Map<string, Set<Function>>` (replace EventEmitter pattern)
   - Constants: `MESSAGE_TYPE` (BEARBY_REQUEST/RESPONSE/EVENT), `BEARBY_INJECTED_EVENT`, `BEARBY_CONTENT_EVENT`

4. **Constructor:**
   - Initialize event listeners map
   - Call `#setupFlutterEventHandler()` (register `window.handleBearbyEvent`)
   - If not Flutter mode, call `#setupDocumentListener()` (listen to DOM events)

5. **Request method** `request(payload)`:
   - Validate method in `supportedMethods`
   - Branch: `if (#isFlutterMode) return #requestFlutter(payload)` else `return #requestExtension(payload)`
   - Add error codes: `4200` (unsupported), `4900` (channel unavailable), `4000` (generic)

6. **`#requestFlutter()` method:**
   - Generate `uuid = uuidv4()`
   - Get metadata: `const meta = getMetaDataFromTags()`, `const icon = getFavicon()`
   - Build message: `{ type: MESSAGE_TYPE.REQUEST, uuid, payload, icon, ...meta }`
   - Create promise with `window.addEventListener("message")` one-time handler
   - Call `(window as any).flutter_inappwebview.callHandler("TIP6963TRON", JSON.stringify(message))`
   - On response: match `uuid`, resolve/reject, remove listener
   - Error handling: catch and reject with proper error codes

7. **`#requestExtension()` method:**
   - Similar to EVM: dispatch `BEARBY_CONTENT_EVENT` custom event
   - Listen for `BEARBY_INJECTED_EVENT` response
   - Same UUID matching and promise resolution

8. **Event handling methods** `on()`, `removeListener()`:
   - Manage `#eventListeners` Map
   - Events: `connect`, `disconnect`, `chainChanged`, `accountsChanged`, `message`

9. **`#handleNativeEvent()` method:**
   - Called from `window.handleBearbyEvent` (Flutter) OR DOM event listener (Extension)
   - Parse `eventData` with `{ event, data }`
   - Dispatch to appropriate event listeners
   - For `chainChanged`: validate hex format (`0x` prefix)

10. **Tron-specific methods** (from old TronProvider):
    - `sign()`, `signMessageV2()`, `multiSign()`, `_signTypedData()`
    - `enable()` method
    - TronWeb stub building

11. **Constants:**
    - Add `supportedMethods: Set<string>` with Tron-specific methods

---

### **Phase 3: Update Types and Interfaces**
**File:** `src/types.ts`

**Changes:**
1. Add `MESSAGE_TYPE` constants
2. Verify error code constants exist
3. Add `BearbyEventData` interface
4. Remove EIP6963-related types
5. Keep Tron-specific types: `InitProviderData`, `NodeConfig`, etc.

---

### **Phase 4: Update Utils**
**File:** `src/utils.ts`

**Changes:**
- Remove `uuid()` function (replaced by uuid.ts)
- Remove `getSiteMetadata()` and `SiteMetadata` interface (replaced by meta.ts)
- Keep: `isFunction()`, `isTronAddress()`, `rgbToHex()` (used in meta.ts)

---

### **Phase 5: Update Entry Point**
**File:** `index.ts`

**Changes:**
1. Import `BearbyProviderImpl` from `./src/bearby-provider`
2. Create provider instance
3. Inject to `window.tron`
4. Remove EIP-6963 discovery (no `announceProvider`, no `setupEIP6963RequestListener`)
5. Keep `__bearbyInjected` flag
6. Remove old provider/tunnel imports

---

### **Phase 6: Delete Old Architecture Files**
**Files to delete:**
- `src/flutter-tunnel.ts`
- `src/request-handler.ts`
- `src/tunnel.ts`
- `src/event-emitter.ts`
- `src/tron-provider.ts` (replaced by bearby-provider.ts)

---

### **Phase 7: Build and Verify**
1. Run `bun run check` (TypeScript)
2. Run `bun run build`
3. Fix any errors

---

## **File Structure After Migration**

```
tron-web3/
├── src/
│   ├── bearby-provider.ts  (NEW: main provider)
│   ├── types.ts            (UPDATED)
│   ├── favicon.ts          (NEW)
│   ├── meta.ts             (NEW)
│   ├── uuid.ts             (NEW)
│   └── utils.ts            (UPDATED: reduced)
├── index.ts                (UPDATED)
├── package.json
└── tsconfig.json
```

**Deleted:**
- `src/flutter-tunnel.ts`
- `src/request-handler.ts`
- `src/tunnel.ts`
- `src/event-emitter.ts`
- `src/tron-provider.ts`

---

## **Key Requirements**

- Handler Name: `"TIP6963TRON"` (unchanged)
- Message Types: `"BEARBY_REQUEST"`, `"BEARBY_RESPONSE"`, `"BEARBY_EVENT"`
- Dual mode: Flutter + Extension
- Events via `window.handleBearbyEvent`
- No provider discovery
- UUID: `uuidv4()` with crypto.randomUUID() fallback
- Error codes: 4200, 4900, 4000
- No code comments
- No code duplication
- Best practices
