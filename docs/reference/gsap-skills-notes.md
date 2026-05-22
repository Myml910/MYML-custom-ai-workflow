# GSAP Skills Notes for MYML Canvas

## Decision

`greensock/gsap-skills` is approved only as an animation audit and implementation-specification reference for MYML Canvas agents.

Current phase:

- Do not install `gsap`.
- Do not install `@gsap/react`.
- Do not add GSAP runtime code to MYML Canvas.
- Do not use GSAP to rewrite existing CSS motion, SVG connection motion, drag behavior, zoom behavior, or canvas interaction.

This reference can supplement `.agents/skills/impeccable/reference/motion-design.md` with more implementation-focused checks, especially when reviewing React animation cleanup, SVG motion, pointer event safety, and main-thread performance.

## Product Fit

MYML Canvas is an internal AI creative workflow canvas for design teams. It should feel like a stable production workspace, not an animation demo.

Because current stability concerns include browser freezes and canvas interaction failures, animation guidance must be used first as an audit tool, not as a reason to add a new animation dependency.

## Allowed Use

- Audit existing motion for leaks, stale callbacks, and unbounded animation loops.
- Review future isolated animation implementations before they land.
- Extract checklist items into impeccable motion reviews.
- Use as a reference when discussing React lifecycle cleanup, timeline ownership, `requestAnimationFrame`, SVG animation, reduced motion, and layout-thrashing avoidance.

## Forbidden Use

- No npm installation of `gsap` or `@gsap/react` at the current stage.
- No GSAP in core canvas interaction paths.
- No changes to `CanvasNode`, `ConnectionsLayer`, `NodeConnectors`, drag, zoom, pan, connection, or node creation logic based on this reference alone.
- No ScrollTrigger, smooth scroll, pinned scroll, cursor follower, or global animation manager in the canvas workspace.
- No timeline or tween creation during render.
- No global event listeners, timers, or animation frames without explicit cleanup.

## Checklist for Impeccable Motion Reviews

### React Cleanup

- Animation setup must be scoped to a component root or explicit refs.
- All timelines, tweens, event listeners, observers, timers, and animation frames must be cleaned up on unmount.
- React Strict Mode double-mount behavior must not duplicate animation instances.
- Callbacks must not update stale or unmounted nodes.
- Animation effects should be idempotent when dependencies change.

### Timeline Lifecycle

- Create timelines only when the owning component or state transition needs them.
- Store imperative timeline handles in refs when lifecycle control is needed.
- Kill, pause, or revert timelines when the component unmounts or becomes inactive.
- Do not create new timelines inside pointermove, scroll, resize, or animation-frame loops.
- Avoid long-running decorative timelines in the main canvas workspace.

### requestAnimationFrame

- Each feature should have a clear owner for its animation frame loop.
- Always cancel pending animation frames on cleanup.
- Avoid nested or competing frame loops.
- Batch DOM reads before DOM writes.
- Avoid setting React state on every frame unless the component is explicitly designed for it.
- Throttle or coalesce pointer-driven updates.

### SVG Motion

- Prefer bounded transform, opacity, and stroke-dashoffset motion.
- Avoid animating large numbers of SVG nodes at once.
- Decorative SVG layers should usually use `pointer-events: none`.
- Interactive SVG hit areas must be explicit, predictable, and tested at different zoom levels.
- SVG effects must respect reduced motion.

### pointer-events and Invisible Layers

- Invisible overlays must not block canvas clicks, drag, zoom, node creation, or connector interaction.
- Decorative layers should be `pointer-events: none`.
- If GSAP is ever introduced later, prefer visibility-aware patterns such as `autoAlpha` for fade-out states so hidden elements do not remain interactable.
- Audit z-index and overlay stacking whenever an interaction becomes unreachable.

### Layout Thrashing

- Do not animate layout-driving properties casually: `width`, `height`, `top`, `left`, margins, padding, or layout grid dimensions.
- Prefer compositor-friendly transform and opacity.
- Avoid repeated `getBoundingClientRect`, path measurement, or style reads inside write-heavy loops.
- When geometry measurement is necessary, batch reads first and writes second.
- Do not set `will-change` globally or preemptively.

### Reduced Motion

- Every spatial or looping animation needs a `prefers-reduced-motion` fallback.
- Functional state feedback may remain, but should reduce spatial movement and repetition.
- Infinite decorative motion should stop under reduced motion.
- Canvas usability must be preserved when all nonessential motion is disabled.

## Freeze and Interaction Failure Audit Prompts

When investigating browser freezes or canvas interaction loss, check:

- Active `requestAnimationFrame` loops that continue after unmount or hidden state.
- SVG path measurement or animation running across many connections.
- Invisible overlays or decorative layers intercepting pointer events.
- Heavy `backdrop-filter`, blur, shadow, or filter effects on large surfaces.
- Pointermove handlers that mix layout reads and writes.
- Animation loops that update React state too frequently.
- Reduced-motion paths that still run expensive decorative work.

## Future Adoption Gate

Before adding GSAP as a dependency in MYML Canvas, require:

- A specific isolated feature that cannot be handled well with existing CSS motion.
- A written performance budget.
- A cleanup plan for React lifecycle, route changes, and reduced motion.
- Browser testing on a lower-end design-team machine.
- Confirmation that no core canvas drag, zoom, pan, connection, or node creation behavior is affected.

## Sources

- https://github.com/greensock/gsap-skills
- https://raw.githubusercontent.com/greensock/gsap-skills/main/skills/gsap-react/SKILL.md
- https://raw.githubusercontent.com/greensock/gsap-skills/main/skills/gsap-performance/SKILL.md
- https://raw.githubusercontent.com/greensock/gsap-skills/main/skills/gsap-scrolltrigger/SKILL.md
