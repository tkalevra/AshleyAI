# Presets

A preset is the part of the safety prompt a parent controls: tone, latitude, and
age-appropriate framing. Each person on the system has exactly one, set from the settings
panel, and can have either half of it overridden with free text.

What a preset **cannot** do is remove `SAFETY_CORE` — that is appended after everything
below, always. See [safety-model.md](safety-model.md).

---

## The four templates

| id | Shown as | Age band | Latitude |
|---|---|---|---|
| `child_8_12_restrictive` | Child (8–12) · Gentle | 8–12 | most protective |
| `child_8_12_unhinged` | Child (8–12) · Playful | 8–12 | relaxed, still child-safe |
| `teen_13_16_restrictive` | Teen (13–16) · Guided | 13–16 | protective, treated as older |
| `teen_13_16_unhinged` | Teen (13–16) · Unfiltered | 13–16 | most latitude |

Two axes, and they do different jobs.

### Latitude — tone, never safety

**"Relaxed" means loose in tone. It is never loose on safety.**

| | Relaxed buys | Relaxed never buys |
|---|---|---|
| | casual swearing | sexual content |
| | dark humour, sarcasm | instructions for dangerous things |
| | edgier subject matter | secrecy from parents |
| | banter and teasing | cruelty, or targeting a real person |
| | no moralising, no disclaimers | physical intimidation or intimacy |

The right-hand column is `SAFETY_CORE`. Relaxed presets carry it unchanged, in the same
position, with the same force as the protective ones.

The "no disclaimers" line is worth understanding rather than skipping. A character that ends
every third message with a safety note is a character a child stops reading — and a child
who has learned to skim past the safety text is worse off than one who never saw it. The
relaxed presets buy the absence of that, not the absence of the rule underneath it.

Protective presets add: no swearing; a warmer, calmer register; gentle redirection away from
distressing material; and a stronger tendency to suggest talking to a trusted adult.

### Age band — register, not just rules

An 8-year-old and a 15-year-old are not the same person with different permissions. The band
changes:

- **Vocabulary and sentence length.** Simpler and more concrete at 8–12.
- **Assumptions about independence.** A 15-year-old has their own social life, opinions, and
  reasons; a character that talks to them as though they do not will not be talked to twice.
- **How school, friendship and identity topics are handled.** At 8–12 these are handled
  warmly and simply. At 13–16 they are handled as real, with the seriousness they have at
  that age, without being turned into a lesson.
- **What "redirect" means.** At 8–12, away from distressing material fairly readily. At
  13–16, more sparingly — a teen who is redirected every time a topic gets real learns the
  character is not worth talking to about anything that matters.

Putting a teenager on a child preset is not a conservative choice. It is a different failure:
they read it as condescension and go and find something with no floor under it at all.

---

## Choosing one

The panel shows each preset's label and a one-paragraph description, so a parent can choose
without reading prompt text. The age band and latitude are visible in the user list, so it
is obvious at a glance that a 10-year-old and a 15-year-old are not on the same settings.

Rough guidance, and it is only guidance — you know your child:

- **Child · Gentle** — the default, and the right starting point for a younger child or a
  first deployment. Start here and loosen if it grates.
- **Child · Playful** — a younger child who finds the gentle preset patronising, in a
  household where mild swearing is not an event.
- **Teen · Guided** — a teenager you want spoken to as a teenager, with the character still
  steering away from the bleaker ground.
- **Teen · Unfiltered** — the most latitude Ashley offers. Still floored by `SAFETY_CORE`.

You can change it at any time; it takes effect on the next message.

---

## Overrides

Either editable layer — the **guardrail** (before the character sheet) or the **safety
floor** (after it) — can be replaced per user with free text typed by a parent.

- Each editor is pre-filled with the **effective** text: what the model will actually get,
  with placeholders resolved.
- Each shows its state — *Using the template* or *Customised* — and has its own **Reset to
  template** button.
- Reset clears the override. It does not modify the template.
- Blank is not a prompt. Saving whitespace is rejected with a `400`.
- An override is **per user**. It does not affect anyone else, and it does not change the
  shipped preset.

`POST /api/admin/config/reset-prompts` restores the four templates verbatim from the
constants in source, if a preset itself has somehow been altered on disk.

**An override cannot remove `SAFETY_CORE` and cannot get in front of it.** You are editing
layers 1 and 3. Layer 4 is appended after both, and is not reachable from the panel.

---

## Placeholders

Preset text may contain:

| Placeholder | Resolves to |
|---|---|
| `{{name}}` | the user's display name |
| `{{age_band}}` | the preset's band, e.g. `8-12` |

They are substituted when the prompt is composed. A missing or blank name resolves to
**`the user`** — a literal `{{name}}` is never sent to the model.

The shipped prompt text names nobody and assumes nothing. It refers to the child by
placeholder and uses **they/them** throughout. If you write an override, doing the same is
worth the small effort: a prompt that has guessed wrong about a child is a prompt that is
being corrected instead of read.

---

## Where they live

Presets and per-user profiles are stored in `/data/config/config.json`, written by the
backend and read **read-only** by the pipeline:

```json
{
  "presets": {
    "child_8_12_restrictive": {
      "id": "child_8_12_restrictive",
      "label": "Child (8–12) · Gentle",
      "age_band": "8-12",
      "latitude": "restrictive",
      "description": "One paragraph, shown to the parent in the panel.",
      "guardrail_system": "…",
      "safety_floor": "…"
    }
  },
  "default_preset": "child_8_12_restrictive",
  "profiles": {
    "u_8f3a1c2b": {
      "display_name": "Alex",
      "preset": "teen_13_16_unhinged",
      "guardrail_system": null,
      "safety_floor": null
    }
  }
}
```

`null` in an override field means "use the preset". `profiles` is maintained by the backend
whenever a user is created, renamed, or has their settings changed; it exists so the pipeline
can resolve prompts **without trusting anything the caller sent**.

The backend adds `ashley_user_id` to the request it sends the pipeline. **The wire carries an
id, never prompt text.** A forged body can at most select an existing user's legitimate
profile. An unknown, missing or malformed id falls back to `child_8_12_restrictive` — the
most restrictive preset, not the configured default — and is logged.

---

## API

All of these require an admin session; every route under `/api/admin/` fails closed with
`401` otherwise.

| Route | Does |
|---|---|
| `GET /api/admin/presets` | Metadata for the four templates — `id`, `label`, `age_band`, `latitude`, `description` — plus `default_preset`. Not the prompt bodies. |
| `GET /api/admin/users/<id>/prompts` | That user's `preset`, raw overrides, `effective` text with placeholders resolved, an `overridden` flag per layer, and `safety_core` as read-only display text. |
| `PUT /api/admin/users/<id>/prompts` | `{preset?, guardrail_system?, safety_floor?}`. `null` clears an override; whitespace is rejected `400`. |
| `POST /api/admin/users/<id>/prompts/reset` | Clears both overrides, keeps the preset. |
| `POST /api/admin/config/reset-prompts` | Restores the shipped templates from source constants. |

Creating a user takes an optional `preset`, defaulting to `default_preset`. Deleting a user
removes their `profiles` entry along with their chat directory.
