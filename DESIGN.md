---
name: TTSMM-EX
description: Dense desktop utility design system for TerraTech Steam mod management.
colors:
  primary: "#a05442"
  primary-hover: "#96503f"
  primary-active: "#854435"
  success: "#6d9c6c"
  warning: "#c08a4f"
  error: "#b86159"
  info: "#b65b47"
  link: "#c9735d"
  background: "#131517"
  surface: "#1b1f24"
  surface-alt: "#171b20"
  surface-elevated: "#20252b"
  sider: "#111315"
  footer: "#171a1f"
  border: "#2b323a"
  split: "#222931"
  table-header: "#191d22"
  table-header-text: "#efe8df"
  text-base: "#f2ede6"
  tag-default-text: "#e8e1d7"
typography:
  display:
    fontFamily: "Aptos, Segoe UI Variable Text, Noto Sans, Segoe UI, sans-serif"
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: "0"
  title:
    fontFamily: "Aptos, Segoe UI Variable Text, Noto Sans, Segoe UI, sans-serif"
    fontSize: "28px"
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: "0"
  body:
    fontFamily: "Aptos, Segoe UI Variable Text, Noto Sans, Segoe UI, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.45
    letterSpacing: "0"
  label:
    fontFamily: "Aptos, Segoe UI Variable Text, Noto Sans, Segoe UI, sans-serif"
    fontSize: "13px"
    fontWeight: 650
    lineHeight: 1.35
    letterSpacing: "0"
  mono:
    fontFamily: "Cascadia Mono, Consolas, monospace"
    fontSize: "12.5px"
    fontWeight: 400
rounded:
  sm: "6px"
  md: "8px"
  lg: "10px"
spacing:
  control: "44px"
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
components:
  button-default:
    backgroundColor: "{colors.surface-elevated}"
    textColor: "{colors.text-base}"
    rounded: "{rounded.md}"
    padding: "0 14px"
    height: "{spacing.control}"
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.text-base}"
    rounded: "{rounded.md}"
    padding: "0 14px"
    height: "{spacing.control}"
  input-default:
    backgroundColor: "{colors.surface-elevated}"
    textColor: "{colors.text-base}"
    rounded: "{rounded.md}"
    padding: "0 11px"
    height: "{spacing.control}"
  tag-default:
    backgroundColor: "{colors.surface-elevated}"
    textColor: "{colors.tag-default-text}"
    rounded: "{rounded.sm}"
    padding: "0 7px"
---

# Design System: TTSMM-EX

## 1. Overview

**Creative North Star: "The Mod Bench"**

TTSMM-EX should feel like a practical workbench beside a PC game install: compact, sturdy, and immediately ready for correction work. The current interface is a dark desktop utility with warm off-white text, muted charcoal surfaces, and a rust primary that marks action and selection without turning the app into a promotional surface.

The user is managing Steam Workshop mods, validation, game paths, dependencies, and launch flow. The design must stay dense enough for repeated use, with obvious hierarchy for first-time recovery. It rejects anything that feels like browsing, promotion, discovery, a storefront, or a social feed.

**Key Characteristics:**
- Compact desktop density with 44px controls and table-first work areas.
- Warm charcoal neutrals, never pure black or pure white.
- Rust primary used for commit actions, selection, focus, and links.
- Status colors are muted and operational, not decorative.
- Familiar controls win: buttons, fields, tables, tabs, switches, dialogs, and side navigation.

## 2. Colors

The palette is restrained: warm charcoal layers carry most of the UI, while rust and muted semantic colors signal action and state.

### Primary
- **Workshop Rust** (`primary`): Used for primary buttons, selected rows, active tab rules, focus accents, checkbox accents, and links.
- **Pressed Rust** (`primary-hover`, `primary-active`): Used only for hover and active states on primary controls.

### Secondary
- **Validation Sage** (`success`): Used for resolved status, installed dependencies, and successful save or validation feedback.
- **Dependency Amber** (`warning`): Used for missing, pending, or attention-needed dependency states.
- **Fault Clay** (`error`): Used for destructive actions, validation failures, blocked saves, and required-field markers.
- **Notice Brick** (`info`): Used for informational tags and status callouts where the primary would imply action.

### Neutral
- **Workbench Black** (`background`): App background and overlay tint base.
- **Panel Charcoal** (`surface`): Main table and settings panel surface.
- **Inset Charcoal** (`surface-alt`): Hover rows, footer zones, and secondary panel tone.
- **Raised Charcoal** (`surface-elevated`): Buttons, inputs, headers, selected nav, and modal bodies.
- **Rail Charcoal** (`sider`): Persistent navigation rail.
- **Hairline Steel** (`border`, `split`): Dividers, field borders, table rules, and modal boundaries.
- **Warm Chalk** (`text-base`, `table-header-text`): Primary text and table header text.
- **Tag Chalk** (`tag-default-text`): Neutral tag text.

### Named Rules
**The Rust Is a Verb Rule.** Use the primary only when something is selected, focused, actionable, or committed. It is not decoration.

**The Charcoal Ladder Rule.** Depth comes from adjacent neutral layers, not large color jumps. Move from `background` to `surface` to `surface-elevated` before adding shadow.

## 3. Typography

**Display Font:** Aptos with Segoe UI Variable Text, Noto Sans, Segoe UI, and sans-serif fallbacks.
**Body Font:** Aptos with the same system stack.
**Label/Mono Font:** Cascadia Mono and Consolas for command-like values.

**Character:** One sans family keeps the utility native and low-friction. Weight and spacing carry hierarchy; there is no display-font personality layer.

### Hierarchy
- **Display** (700, context-specific, 1.25): Used sparingly for mod detail titles and major page headings.
- **Headline** (700, 16px to 18px, 1.25): Used for modal titles, section heads, and detail headers.
- **Title** (700, 28px, 1.25): Used for full-view titles such as Settings.
- **Body** (400, 16px, 1.45): Used for field help, descriptions, and normal prose. Cap explanatory copy around 70ch.
- **Label** (650, 12px to 13px, 0 letter spacing): Used for navigation, table headers, tags, buttons, and compact labels.
- **Mono** (400, 12.5px): Used for command strings and technical identifiers.

### Named Rules
**The Native Utility Rule.** Do not introduce display fonts, expressive typefaces, negative letter spacing, or fluid type. This is a desktop tool, not a campaign.

## 4. Elevation

The system is flat by default. Depth is conveyed by tonal surfaces, 1px borders, sticky headers, and small state changes. Shadows exist only for menus, dialogs, and overlays that must sit above the work surface.

### Shadow Vocabulary
- **Soft Overlay** (`0 16px 40px rgba(0, 0, 0, 0.22)`): Generic raised overlay shadow from the Tailwind token.
- **Dialog Lift** (`0 16px 36px color-mix(in srgb, var(--app-color-background) 72%, transparent)`): Modal and dialog lift.
- **Menu Lift** (`0 14px 32px color-mix(in srgb, var(--app-color-background) 72%, transparent)`): Header menu and compact popup lift.

### Named Rules
**The Flat Until Floating Rule.** Tables, cards, panels, rows, and settings groups stay flat. Only menus and dialogs cast shadows.

## 5. Components

### Buttons
- **Shape:** Gently squared controls with 8px radius for standard actions and 6px for compact detail buttons.
- **Primary:** Workshop Rust background, Warm Chalk text, 44px minimum height, 14px horizontal padding, 650 weight.
- **Hover / Focus:** Hover shifts to `primary-hover`. Focus uses a two-ring treatment: background-colored inner ring plus a warm text and primary mixed outer ring.
- **Secondary / Ghost / Tertiary:** Secondary buttons use Raised Charcoal with Hairline Steel borders. Icon-only buttons are 32px square in detail areas and transparent until hover.

### Chips
- **Style:** Small 22px tags with 4px radius, 12px type, 600 to 650 weight, Raised Charcoal background, and Hairline Steel border.
- **State:** Semantic tags use low-alpha mixes of success, warning, error, info, or primary. Tags must remain compact and readable in dense rows.

### Cards / Containers
- **Corner Style:** 8px radius for panels and modals, 6px for menus and compact controls.
- **Background:** Panels use Panel Charcoal; raised controls and modal bodies use Raised Charcoal.
- **Shadow Strategy:** No shadow on normal panels. Dialogs and menus use the elevation vocabulary above.
- **Border:** 1px Hairline Steel borders define almost every container boundary.
- **Internal Padding:** Settings panels use 18px horizontal and 16px vertical padding. Dialog bodies use 16px.

### Inputs / Fields
- **Style:** 44px minimum height, 8px radius, 1px Hairline Steel border, Raised Charcoal background, 11px horizontal padding.
- **Focus:** Border shifts to Workshop Rust and receives the same two-ring focus treatment as buttons.
- **Error / Disabled:** Errors use Fault Clay text. Disabled fields use Panel Charcoal with muted text and 0.55 opacity for disabled controls.

### Navigation
- **Style, typography, default/hover/active states, mobile treatment.** The side rail is 120px wide, collapses to 56px, and uses 52px-high nav buttons with 8px radius. Labels are uppercase 13px, 600 weight, with no letter spacing. Hover and selected states use Raised Charcoal and Warm Chalk.

### Tables
- **Structure:** Virtualized tables use fixed layout, sticky 42px headers, 44px to 48px rows, tabular numbers, and 1px row dividers.
- **State:** Hover rows use `surface-alt`; selected rows use a low-alpha primary mix. Resize handles are 44px hit targets with a 2px visual line.

### Dialogs
- **Structure:** Centered overlays use a 72% background mix, 8px radius, 1px border, and Dialog Lift shadow.
- **Behavior:** Headers and footers are separated by 1px borders. Dialogs are for scoped edits and confirmations, not first-choice navigation.

## 6. Do's and Don'ts

### Do:
- **Do** preserve the desktop utility posture: dense, disciplined, and low-noise.
- **Do** use 44px as the standard control height and keep compact table rows at 36px to 48px.
- **Do** rely on 1px borders, sticky headers, and tonal layers before adding shadows.
- **Do** reserve Workshop Rust for action, focus, selection, links, and active state.
- **Do** keep status feedback visible around validation, save, dependency, and launch flows.
- **Do** use familiar desktop patterns: side navigation, tables, tabs, forms, switches, and inline toolbar actions.

### Don't:
- **Don't** mimic a Workshop browser, feed, storefront, promotional landing page, social media product, or content-discovery surface.
- **Don't** use pure black or pure white; keep neutrals warm and tinted.
- **Don't** add gradient text, glassmorphism, decorative motion, hero metrics, or repeated identical card grids.
- **Don't** use colored side-stripe borders on cards, list items, callouts, or alerts.
- **Don't** introduce display fonts, oversized hero type, or marketing-style spacing.
- **Don't** make inactive states full-saturation or visually louder than the user's current task.
