# React Bits Usage Boundary for MYML Canvas

## Decision

`DavidHDev/react-bits` is approved only as a visual inspiration and local reference source for non-core MYML Canvas surfaces.

Current phase:

- Do not install `react-bits`.
- Do not run React Bits `shadcn` or `jsrepo` install commands.
- Do not add any new npm package for React Bits.
- Do not copy React Bits components into the core canvas.
- Do not change runtime code based on this reference alone.

MYML Canvas is a professional internal creative workflow tool. Core workspace stability is more important than decorative motion or portfolio-style visual effects.

## Suitable Reference Areas

React Bits may be reviewed for inspiration in isolated, non-core surfaces:

- Login page.
- EmptyState illustrations or copy structure.
- Agent welcome state.
- Lightweight loading states.
- Demo or presentation pages.
- Internal documentation examples.

Any future use should be adapted to MYML Canvas tokens, density, i18n, dark/light theme behavior, and professional workspace tone.

## Forbidden Areas

React Bits must not be introduced into:

- `CanvasNode`.
- `ConnectionsLayer`.
- `NodeConnectors`.
- Drag behavior.
- Zoom or pan behavior.
- Connection drawing or hit testing.
- Node creation flow.
- Pointer capture or pointer event routing.
- Core canvas overlays.
- Task, provider, database, or workflow runtime paths.

Do not use React Bits components that depend on cursor followers, smooth scrolling, global scroll control, full-screen WebGL backgrounds, physics simulations, or decorative pointer interception in the main canvas workspace.

## Performance Risk

React Bits is oriented toward animated and memorable website experiences. That is not the same performance profile as a long-running production canvas.

Risks to watch:

- WebGL, shader, particle, or post-processing effects can occupy GPU and main-thread budget.
- Mouse-following and pointer-driven components can conflict with canvas drag, pan, selection, and connector gestures.
- Scroll-driven or smooth-scroll effects can interfere with native browser behavior and application-level layout expectations.
- Physics or spring-heavy components can create long-running loops.
- Animated backgrounds and text effects can distract users in a dense production workspace.
- Large blur, filter, shadow, and backdrop-filter effects can be costly on lower-end design-team machines.

## Dependency Risk

Do not treat React Bits as a small dependency. Its repository dependency graph includes animation, 3D, physics, scroll, styling, and utility packages such as GSAP, Motion, Lenis, Matter.js, OGL, postprocessing, and React Three related packages.

MYML Canvas already has Three.js and React Three dependencies for specific features. React Bits should not become a reason to duplicate versions, widen the dependency surface, or add visual effects to the core app.

If a future isolated component is copied manually, evaluate only the exact copied component and its exact dependency needs. Do not import the full library dependency set.

## License Risk

React Bits uses `MIT + Commons Clause`.

Practical interpretation for MYML Canvas:

- Using adapted code inside an internal application may be acceptable, subject to project owner/legal review.
- Keep the copyright and permission notice when copying substantial code.
- Do not sell, sublicense, redistribute, bundle, or port the components themselves as a component product or library.
- Do not build an internal or external component library from copied React Bits components without license review.

Because MYML Canvas is an internal production tool, any direct code copy should be reviewed before merging.

## Style Risk

React Bits is strongest for visually striking websites, demos, and memorable marketing surfaces. Its default feel may be too promotional for MYML Canvas.

When using it as inspiration:

- Reduce spectacle.
- Prefer functional state motion over decoration.
- Keep typography and controls consistent with MYML Canvas.
- Preserve professional dark workspace clarity.
- Avoid saturated gradients, giant animated backgrounds, or novelty interactions in task surfaces.

## Review Checklist for Any Future Use

- Is this outside the core canvas?
- Does it work with MYML Canvas dark and light themes?
- Does it respect Chinese and English UI needs?
- Does it respect `prefers-reduced-motion`?
- Does it avoid global event listeners and global CSS leakage?
- Does it avoid blocking pointer events?
- Does it avoid scroll hijacking?
- Does it avoid new runtime dependencies?
- Has it been profiled on a lower-end machine?
- Has the license notice and Commons Clause boundary been reviewed?

## Current No-op Rule

At the current stage, React Bits remains documentation-only. No npm package should be installed, no component should be copied, and no runtime code should change.

## Sources

- https://github.com/DavidHDev/react-bits
- https://raw.githubusercontent.com/davidhdev/react-bits/main/LICENSE.md
- https://github.com/DavidHDev/react-bits/blob/main/package.json
