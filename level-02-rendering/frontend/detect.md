# How to Detect Rendering Performance Issues

> A deep-dive guide for identifying, measuring, and diagnosing rendering performance problems in React and Next.js applications.

---

## 1. React Rendering Model

React does not update the DOM directly. It maintains a virtual representation (Virtual DOM) and diffs it against the previous version to find minimal changes.

### The Rendering Pipeline

```
State Change
    ↓
Render Phase (can be interrupted by React Concurrent Mode)
    - Component function re-executes
    - Virtual DOM tree is created
    - Diffing algorithm compares new vs old tree
    - List of DOM mutations is prepared
    ↓
Commit Phase (synchronous, cannot be interrupted)
    - DOM is actually mutated
    - Refs are updated
    - useEffect callbacks run
    ↓
Paint Phase (browser)
    - Layout is calculated
    - Pixels are painted to screen
```

### What Causes a Re-render

A component re-renders when:

1. **State changes:** `setState`, `useState` setter, `useReducer` dispatch
2. **Parent re-renders:** Children re-render by default even if props haven't changed
3. **Context changes:** Any `useContext` consumer re-renders when context value changes
4. **Force re-render:** `forceUpdate()`, `useReducer` with identical state

A component does NOT re-render when:
- Sibling state changes
- Unrelated context changes (if using `React.memo` correctly)

### Fiber Architecture

React 18 uses a fiber-based reconciler. Each component is a fiber node containing:
- **State hooks:** Current state values
- **Effect hooks:** Pending effects
- **Child/sibling/return:** Tree pointers for traversal
- **Priority lane:** Which update queue this belongs to

The key insight: React can pause rendering mid-tree (in concurrent mode), render higher-priority updates first, then resume. This is why you might see partial UI updates.

---

## 2. Detecting Unnecessary Re-renders

### React DevTools Profiler

1. Open React DevTools → Profiler tab
2. Click the record button (circle)
3. Interact with your component
4. Stop recording

**Ranked Chart:** Shows each component that rendered, sorted by time. If a component appears with zero actual duration, it rendered but produced identical output -- that is waste.

**Flame Chart:** Shows the component tree over time. Wide bars = expensive renders. Nested bars = parent-child render chain.

**Commit Graph:** Shows render counts and durations over time. Spikes indicate batched updates.

### Identifying Wasted Renders

Look for components where:
- `actualDuration` is > 0 but the visual output is identical
- `baseDuration` is much larger than `actualDuration` (the component is expensive to render but not memoized)
- A component renders multiple times in quick succession without user interaction

### why-did-you-render

```typescript
// In your entry file (e.g., _app.tsx or index.tsx)
import React from 'react';

if (process.env.NODE_ENV === 'development') {
  const whyDidYouRender = require('@welldone-software/why-did-you-render');
  whyDidYouRender(React, { trackAllPureComponents: true });
}

// Then in any component:
Component.whyDidYouRender = true;
```

This logs to console when a component re-renders with identical props. It tells you exactly which prop changed and triggered the re-render.

---

## 3. Hydration Issues in Next.js

### What Hydration Is

During SSR, React renders the component tree to HTML on the server. When the page loads in the browser, React "hydrates" the HTML -- it attaches event handlers and rebuilds the internal state tree. The resulting virtual DOM must match the server-rendered HTML exactly.

### Hydration Mismatch Errors

```
Warning: Text content did not match. Server: "January 15, 2024" Client: "January 15, 2025"
Warning: Expected server HTML to contain a matching <div> for className
```

Common causes:
- `Date.now()` or `new Date()` in render (different server vs client time)
- `Math.random()` in render (different values)
- Browser extensions injecting elements
- `window` or `document` access in render without `useEffect`
- Local storage reads in render

### Detecting Hydration Issues

1. **Console warnings:** Next.js logs hydration mismatches in development
2. **React DevTools:** Components with hydration issues show a warning badge
3. **Network tab:** If the server HTML differs from client HTML, you will see a full re-render flash

### Suspense Boundaries and Dehydration

When a component suspends during SSR, Next.js renders the fallback on the server, then replaces it with the actual content during hydration. This is "dehydration" -- the server HTML for that boundary is a placeholder.

Detect by looking for skeleton-to-content flashes on page load. Each Suspense boundary that flashes is a dehydrated region.

### Selective Hydration

React 18 can hydrate components out of order based on priority. A component wrapped in `<Suspense>` can hydrate before its parent, if the user interacts with it first. This is visible in the profiler as non-sequential hydration events.

---

## 4. SSR vs CSR vs SSG Performance Signatures

### How to Tell Which Strategy a Page Uses

**SSG (Static Site Generation):**
- TTFB is very fast (< 100ms) because the HTML is pre-built
- HTML response is the same for every request
- No "Waiting" phase in the Network tab -- it is served from CDN/cache
- `__NEXT_DATA__` contains `buildId` but no runtime data props

**SSR (Server-Side Rendering):**
- TTFB is slower (200ms-2s) because the server renders on each request
- HTML response varies based on request parameters
- Network tab shows a longer "Waiting" phase
- `__NEXT_DATA__` contains the data props used for rendering

**CSR (Client-Side Rendering):**
- HTML response is minimal (just a `<div id="root">`)
- JavaScript bundle loads, then content appears
- Network waterfall: HTML → JS bundle → API calls → render
- Large time between FCP and content appearing

### Network Waterfall Comparison

```
SSG:  |=== HTML (fast) ===|
      Total: ~50ms

SSR:  |=== Waiting (server) ===|=== HTML ===|
      Total: ~500ms

CSR:  |== HTML ==|=== JS Bundle ===|=== API ===|=== Render ===|
      Total: ~3000ms
```

### TTFB Differences

- SSG: 10-50ms (CDN edge)
- SSR: 200-2000ms (server render time)
- CSR: 50-200ms (just the shell HTML)

---

## 5. Detecting Layout Thrashing

### What Layout Thrashing Is

Layout thrashing occurs when JavaScript reads a layout property (offsetHeight, clientWidth, getBoundingClientRect) and then immediately writes to the DOM, forcing the browser to recalculate layout before the next read.

```
Read layout → Write DOM → Read layout → Write DOM → ...
    ↑ Reflow      ↑ Paint      ↑ Reflow      ↑ Paint
```

Each reflow forces the browser to recalculate the entire layout tree. This is extremely expensive.

### Which DOM APIs Trigger Layout

**Reads (trigger layout if layout is dirty):**
- `offsetHeight`, `offsetWidth`
- `clientHeight`, `clientWidth`
- `scrollTop`, `scrollLeft`
- `getComputedStyle()`
- `getBoundingClientRect()`
- `window.getComputedStyle()`

**Writes (invalidate layout):**
- `element.style.property = value`
- `element.classList.add/remove()`
- `element.setAttribute()`
- `element.appendChild()`
- `element.innerHTML = ...`

### How to See It in DevTools

1. Open Chrome DevTools → Performance tab
2. Record a session while interacting
3. Look for purple (Layout) and green (Paint) bars interleaved rapidly
4. In the summary, if "Recalculate Style" and "Layout" take significant time, you have thrashing

### Example of Thrashing

```typescript
// BAD: Read-write-read cycle
for (const item of items) {
  const height = item.offsetHeight;        // Read (triggers layout)
  item.style.height = `${height + 10}px`; // Write (invalidates layout)
}

// GOOD: Batch reads, then batch writes
const heights = items.map((item) => item.offsetHeight); // All reads
items.forEach((item, i) => {
  item.style.height = `${heights[i] + 10}px`;           // All writes
});
```

---

## 6. Detecting Render-Blocking Resources

### The Coverage Tab

1. Open Chrome DevTools → Coverage tab
2. Click the record button and reload the page
3. The coverage report shows each file with a bar: green = used, red = unused

**What "Unused CSS/JS" means:** The browser downloaded, parsed, and compiled this code, but never executed it. On a page with 500KB of JavaScript and 60% unused, you wasted 300KB of download + parse time.

### Render-Blocking Scripts in the Performance Timeline

In the Performance tab, look for the "Parse HTML" event. If it has long gaps, a script is blocking parsing. The timeline shows:

```
Parse HTML: ||||||||||||||||
Script:     ░░░░░████████░░░░░  ← Blocking script
Parse HTML:             ||||||||
```

The script block pauses HTML parsing. The browser cannot render any content until the script finishes downloading and executing.

### How to Detect

1. Performance tab → look for yellow (Scripting) bars during the initial page load
2. Network tab → filter by "JS" → sort by "Priority" → look for "Highest" or "High"
3. Lighthouse → "Eliminate render-blocking resources" audit

---

## 7. React Concurrent Features

### useTransition and useDeferredValue

React 18 introduces concurrent features that allow React to interrupt rendering. Detecting whether they are working requires specific observation.

### How to Detect if Transitions are Working

```typescript
const [isPending, startTransition] = useTransition();

// When this runs, isPending is true during the re-render
// The UI remains responsive (previous state stays visible)
startTransition(() => {
  setFilter(inputValue); // This update is marked as low-priority
});
```

In React DevTools:
- The component shows "Pending" state during the transition
- The profiler shows the update has lower priority
- The UI does not freeze during the update

### Deferred Rendering

```typescript
const deferredValue = useDeferredValue(inputValue);
// deferredValue lags behind inputValue
// React prioritizes the input response over the filtered list
```

Detect by:
- Input remains responsive while a large list updates
- Profiler shows two separate commits: one for input, one for list
- The list update has a lower priority lane in the profiler

### Tearing

Tearing occurs when different parts of the component tree show different versions of the same state. This happens when concurrent rendering is interrupted mid-tree.

In development, React Strict Mode intentionally causes tearing to help you find bugs. In production, tearing indicates a concurrent rendering issue.

---

## 8. Detecting Over-fetching

### Network Tab Analysis

1. Open Network tab
2. Filter by "Fetch/XHR"
3. Look for requests that return data not used in the visible UI

### Identifying Unused Data

Compare the response payload size with what is actually rendered:
- API returns 100 products, page shows 10 -- you over-fetched by 90%
- API returns all fields, page uses 3 of 20 -- you over-serialized by 85%

### Common Over-fetching Patterns

**Waterfall over-fetching:**
```
Component A mounts → fetches /api/user
  Component B mounts → fetches /api/products (depends on user.id)
    Component C mounts → fetches /api/reviews (depends on product.id)
```

Each component waits for the previous fetch. Total time = sum of all fetches.

**Parallel detection:** Look at the Network tab timeline. If requests start sequentially like stairs, you have a waterfall. If they all start at the same time, they are parallel.

**GraphQL over-fetching:** Query returns nested data that the current view does not need. Use field-level analysis tools to identify unused fields.

---

## 9. Server Component vs Client Component

### How to Detect the Boundary

In Next.js App Router, components are Server Components by default. Client Components are marked with `"use client"` at the top of the file.

### React DevTools Component Type Indicators

- **Server Components:** Shown with a green server icon in React DevTools
- **Client Components:** Shown with a blue globe icon
- **Server Actions:** Shown with a special badge

### Common Boundary Issues

**Issue 1: Importing a client component into a server component**
```
Server Component
  └── Client Component (works fine)
```
This works because the server renders the client component's initial HTML, then the client hydrates it.

**Issue 2: Passing functions as props from server to client**
```
Server Component
  └── onClick={handleClick}  ← ERROR: functions cannot be serialized
```
Functions, event handlers, and browser APIs cannot cross the server-client boundary.

**Issue 3: Using hooks in a server component**
```
Server Component
  └── useState() ← ERROR: hooks only work in Client Components
```

### Detecting Boundary Violations

1. **Build errors:** Next.js throws clear errors when you violate the boundary
2. **Runtime errors:** "Functions cannot be passed to Client Components"
3. **DevTools:** Check the component icons to verify the boundary is where you expect
4. **Network tab:** Server Components render on the server and their HTML is sent in the initial response. Client Components load their JavaScript separately.

---

## 10. Rendering Diagnostic Checklist

| # | Issue | Symptom | Tool | Where to Look |
|---|-------|---------|------|---------------|
| 1 | Unnecessary re-renders | UI feels sluggish, components flash | React DevTools Profiler | Ranked chart for zero-duration renders |
| 2 | Hydration mismatch | Console warnings about text content | Browser console | Warning messages with server vs client values |
| 3 | Layout thrashing | Janky scroll, purple bars in timeline | DevTools Performance | Purple (Layout) + green (Paint) interleaving |
| 4 | Render-blocking resources | Slow FCP, long parse time | Lighthouse | "Eliminate render-blocking resources" audit |
| 5 | Large component tree | Slow mount time | React DevTools Profiler | Flame chart width on mount |
| 6 | Context re-render cascade | Many components update unexpectedly | React DevTools Profiler | Components with identical output |
| 7 | Missing memoization | Components re-render on every parent update | React DevTools Profiler | Components with changed props but same output |
| 8 | CSS-in-JS overhead | Slow style computation | DevTools Performance | "Recalculate Style" duration |
| 9 | Over-fetching | Network tab shows unused data | Network tab | Response size vs rendered content |
| 10 | Waterfall requests | Sequential network requests | Network tab | Staircase pattern in timeline |
| 11 | Image CLS | Layout shifts on image load | DevTools Performance | Layout Shift entries |
| 12 | Font FOIT/FOUT | Text flash or invisible text | Network tab | Font file load timing |
| 13 | Hydration flash | Content changes after page load | Visual inspection | Compare server HTML vs client HTML |
| 14 | Excessive DOM size | Slow paint, high memory | DevTools Elements | DOM node count (> 1500 is warning) |
| 15 | Long tasks during render | UI freezes during interaction | DevTools Performance | Yellow (Scripting) bars > 50ms |
| 16 | Suspense fallback flash | Skeleton → content flash | Visual inspection | Each Suspense boundary |
| 17 | Server component boundary | Build/runtime errors | Next.js build output | "use client" placement |
| 18 | State update batching | Multiple re-renders per interaction | React DevTools Profiler | Rapid consecutive commits |
| 19 | useEffect dependency loop | Infinite re-render loop | Browser console | "Maximum update depth exceeded" |
| 20 | Large bundle size | Slow initial load | Lighthouse | "Reduce unused JavaScript" audit |
| 21 | Missing code splitting | All JS loaded on every page | Coverage tab | Files with > 50% unused code |
| 22 | Concurrent mode tearing | Inconsistent UI during updates | React DevTools | Different values in same tree |
| 23 | Offscreen rendering | Memory usage grows unexpectedly | DevTools Memory tab | Detached DOM nodes |
| 24 | Transition not working | UI freezes during updates | React DevTools Profiler | isPending state duration |
| 25 | Server-side data not cached | Slow TTFB on repeat visits | Network tab | Cache-Control headers, TTFB trend |

---

> **Next:** After detecting issues with this guide, move to [fix.md](./fix.md) to learn how to resolve them.
