\# MYML Canvas Product Context



\## Product Identity



MYML Canvas is an internal AI-assisted creative workflow canvas for design teams.



It combines:

\- infinite canvas

\- node-based image/video generation workflows

\- asset management

\- history

\- chat assistance

\- storyboard tools

\- social posting utilities

\- image/video editing utilities



The product should feel like a professional production workspace, not a marketing website or demo.



Reference positioning:

\- Figma-like canvas clarity

\- ComfyUI-like node workflow flexibility

\- Photoshop-like production tool density

\- internal design team tool



\## Target Users



Primary users are internal product/design team members.



They use MYML Canvas to:

\- generate image patterns

\- edit and process images

\- build reusable creative workflows

\- manage assets and history

\- prepare content for product, e-commerce, social, and internal design tasks



Users may work in Chinese or English.



Users may switch between light and dark themes.



\## Product Goals



1\. Provide a stable professional workspace for long creative sessions.

2\. Keep the canvas and creative content as the visual priority.

3\. Make node states, controls, menus, modals, and panels consistent.

4\. Support Chinese/English switching across visible UI copy, placeholders, aria-labels, titles, alt text, and menu items.

5\. Support light/dark theme switching across panels, nodes, menus, modals, forms, status cards, and controls.

6\. Reduce demo-like visual noise: excessive glow, saturated gradients, random platform colors, oversized shadows, inconsistent rounded corners, and hover movement.

7\. Maintain production reliability.



\## Visual Direction



The core design language is:



Professional Dark Workspace + Controlled Neon + Impeccable Shape



Dark mode:

\- App background: #070807 / #080A07

\- Surface base: #101210

\- Surface raised: #151815

\- Surface floating: #1A1D1A

\- Accent: #D8FF00

\- Border: neutral-800 / neutral-700

\- Main text: neutral-100

\- Secondary text: neutral-400

\- Helper text: neutral-500/600



Light mode:

\- Must remain readable and system-consistent.

\- Do not leave dark-only shells, black cards, white text on light surfaces, or invisible borders.

\- Use existing theme mechanisms.

\- Do not create a second theme system.



Accent usage:

\- #D8FF00 is reserved for primary actions, selected states, focus-visible rings, and critical emphasis.

\- Ordinary hover states should use subtle background, border, or opacity changes.

\- Avoid large neon glow, large accent backgrounds, and decorative accent overuse.



Semantic colors:

\- Error: red

\- Warning: amber

\- Success: emerald



\## Shape Rules



Impeccable Shape means all UI elements must have stable, deliberate geometry.



Rules:

\- Modal shells: generally rounded-xl.

\- Cards, fields, dropdowns, status blocks: generally rounded-lg.

\- Small icon buttons: fixed size, centered icon, consistent padding.

\- Border default: 1px.

\- Selected/focus states should use ring, not thicker border.

\- Hover/focus/selected must not cause size jumping.

\- Avoid hover scale.

\- Avoid transition-all.

\- Avoid shadow-2xl and excessive glow.

\- Avoid inconsistent rounded-2xl / rounded-md mixing unless there is a clear hierarchy reason.



\## Typography Rules



\- Panel/modal titles: 15-16px, font-semibold or font-bold.

\- Body text: 13-14px.

\- Helper/meta text: 11-12px.

\- Button text: 12-13px, semibold.

\- Avoid font-black.

\- Avoid tracking-widest for Chinese.

\- Uppercase is acceptable only for short English labels.



\## i18n Rules



All user-facing UI should follow the existing language mechanism.



Must be localized when visible or accessibility-facing:

\- button text

\- modal titles/subtitles

\- placeholders

\- empty states

\- error/success/loading states

\- aria-label

\- title

\- alt

\- tooltips

\- menu items

\- dropdown labels



Allowed to remain English:

\- brand names

\- model names

\- provider names

\- platform names such as X, TikTok, Google, Kling AI, MYML

\- internal console/debug strings not visible in UI



\## Theme Rules



All major UI should follow the existing theme mechanism.



Must be theme-aware:

\- app shell

\- panels

\- cards

\- nodes

\- node controls

\- dropdowns

\- popovers

\- context menus

\- modals

\- form fields

\- status cards

\- buttons

\- toolbars

\- editor shells



Do not hard-code dark-only UI unless the component is explicitly dark-only by product requirement.



\## Engineering Boundaries



For visual, localization, and theme compliance work:



Allowed:

\- className/style cleanup

\- translation key additions

\- existing t()/language/canvasTheme usage

\- small prop passing only when required for i18n/theme

\- accessibility label/title/alt cleanup



Not allowed unless explicitly requested:

\- business logic changes

\- API changes

\- generation pipeline changes

\- drag/zoom/connect algorithm changes

\- store/reducer/context restructuring

\- routing/auth changes

\- data structure changes

\- dependency additions

\- large DOM rewrites

\- modal lifecycle rewrites

\- editor algorithm changes



\## Current Visual Upgrade Status



Completed and committed:

\- Polish dark workspace visual baseline

\- Refine canvas node visual states

\- Refine panel card typography

\- Unify modal visual system

\- Improve core localization and menu theming

\- Localize panel and chat interactions

\- Localize storyboard and import modals



Remaining compliance areas:

\- TwitterPostModal

\- TikTokPostModal

\- VideoEditorModal

\- Image editor subsystem

