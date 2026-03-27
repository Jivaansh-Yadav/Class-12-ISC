# React + shadcn SlideTabs Integration Notes

This repository is currently a static HTML/CSS/JS site and does **not** yet include a React + TypeScript + Tailwind + shadcn setup.

## Current status
- No `package.json` was present before this task.
- No `components.json` (shadcn config) detected.
- No Tailwind config detected.
- No TypeScript config detected.

## Required setup (for React usage)

Run these commands from the project root:

```bash
# 1) Create React app with TypeScript + Tailwind (Vite example)
npm create vite@latest . -- --template react-ts
npm install

# 2) Initialize shadcn
npx shadcn@latest init

# 3) Install animation dependency
npm install framer-motion
```

If `shadcn init` asks for paths, use:
- **components:** `@/components`
- **styles:** `src/index.css` (Vite) or `app/globals.css` (Next.js)

## Default paths
- The shadcn default component base is typically `components` (aliased as `@/components`).
- Reusable shadcn-like UI atoms are conventionally kept in `components/ui`.

## Why `/components/ui` matters
- It keeps low-level, reusable UI primitives in one predictable place.
- It matches shadcn conventions so generated components stay consistent.
- It improves discoverability and avoids mixing page logic with UI building blocks.

## Installed dependency for this task

```bash
npm install framer-motion
```

## Questions to confirm before production usage
1. What data/props should tabs represent (routing paths, filters, external links)?
2. Should tab state be local or synchronized with URL/query params/global state?
3. Any required assets? (none needed for current component)
4. Expected responsive behavior on small screens? (collapse to simpler nav or keep slider)
5. Best placement: top navigation (implemented in `index.html`) and/or React pages.

## Notes on assets/icons
- This component does not require images.
- It does not require SVG logos or icon packages.
- `lucide-react` is therefore not required for this integration.
