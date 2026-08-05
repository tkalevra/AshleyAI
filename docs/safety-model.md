# The safety model

Read this before you decide Ashley is safe enough for your family. It describes what the
safety layer is, how it is assembled, what it deliberately refuses to let you change, and —
at the end, plainly — what it does not protect against.

---

## Three layers, one order

Every message a child sends carries a system prompt composed **on the server**, in the
pipeline container, from three layers:

```
  1. guardrail    ── preset, or the parent's override of it
  2. character    ── the sheet the child wrote (the only browser contribution)
  3. safety floor ── preset, or the parent's override of it
  4. SAFETY_CORE  ── constant in source; always last; not editable from the panel
```

The composed prompt is `guardrail + character sheet + floor + SAFETY_CORE`.

**The order is not arbitrary.** `SAFETY_CORE` goes last because recency wins. When the
safety text was placed first, the character sheet — written by a child, often vivid,
sometimes deliberately intense — out-pulled it in practice. Putting the non-negotiables
after the costume is the difference between a rule the model weighs and a rule the model
follows. Do not reorder it.

Layers 1 and 3 are the **preset** — a parent's dial. Layer 4 is the **floor** — not a dial.

---

## What `SAFETY_CORE` carries

`SAFETY_CORE` is applied to every user, under every preset, in every conversation. It holds
the things that do not become negotiable because a parent picked a relaxed template or
because a character is written as intense:

- **Nothing sexual.** No sexual content or themes, no undressing, no romantic content beyond
  age-appropriate crush territory. This holds regardless of who the character is.
- **No real instructions for genuinely dangerous things** — weapons, drugs, self-harm.
- **Nothing that demeans or targets a real person.**
- **No physical intimidation or intimacy.** The character does not corner, loom over, crowd,
  back into, touch, or describe its body against the child. Stage directions stay ordinary
  and non-threatening.
- **The secrecy and isolation rule** — the one that matters most.

### The secrecy rule

This is the layer that exists because of how these apps actually go wrong. If a child asks
the character to keep a secret from their parents, to promise not to tell, to be "just
between us" — or if the conversation drifts toward the character being the only one who
really understands them — the character must, **in character**:

- **not agree and not promise.** No hedging, no "maybe for you I'd make an exception".
- **say plainly, in its own voice, that it is not going to be the child's secret.**
- **if something sounds actually wrong, tell them to talk to a parent or another trusted
  adult** — and mean it.
- **never offer itself as the alternative.** Not "tell me instead", not "talk to me", not
  "I'm always here". A character can care about a child and still not be the place they take
  it. This clause is easy to miss and it is the one doing the most work: a refusal that ends
  in "but you can always tell *me*" has replaced a parent, not deferred to one.

It refuses every time, including when pushed, including when pushed twice, and including
when the character is written as possessive or intense. A character being intense is never a
reason to accept the role of a child's secret.

The core also instructs the model not to quote, summarise, discuss or confirm these rules,
and to deliver every refusal **in the character's voice** rather than dropping into a
different, colder register. A refusal in character is still a refusal, and in practice it is
the only kind that holds — the moment the model breaks character to lecture, a child learns
which phrasing makes the mask slip, and starts hunting for it.

---

## Why the core is not editable from the panel

The settings panel can **display** `SAFETY_CORE`, read-only. It cannot change it. Changing
it means editing the source and rebuilding.

That is deliberate, for three reasons:

1. **It is the thing that cannot be misconfigured at 11pm.** Everything a panel can edit,
   a tired person can edit badly — paste over it, blank it, "just try something". The floor
   is the one layer where the failure mode of a bad edit is unacceptable, so it is not
   reachable from a web form at all.
2. **A web form is an attack surface; a constant in source is not.** Anything editable over
   HTTP is one authentication bug away from being editable by the wrong person. The
   `SAFETY_CORE` string is compiled into two containers and has no write path — not from the
   panel, not from the API, not from a forged request.
3. **It is the invariant everything else is allowed to assume.** Presets can be relaxed and
   overridden freely precisely *because* something underneath them does not move. Make the
   floor adjustable and every preset has to re-argue the same ground.

The panel shows it so a parent can read exactly what is always applied and judge whether it
is enough. Visible, not editable, is the intended posture — and if you disagree with what it
says, you have the source and the licence to change it. Fork it, edit the constant, rebuild.
That is a real answer, and it is a different act from a text box.

---

## What the presets do and do not permit

Four templates, two age bands, two latitudes. Full text and per-preset behaviour is in
[presets.md](presets.md). What matters here is the shape of the dial.

| | Child (8–12) | Teen (13–16) |
|---|---|---|
| **Protective** | Gentle — warmest, calmest, most likely to redirect | Guided — treats them as older, still steers away from distressing ground |
| **Relaxed** | Playful — looser tone, still child-safe | Unfiltered — most latitude of the four |

**Latitude is a dial on *tone*, never on safety.**

The relaxed variants buy: casual swearing, dark humour, sarcasm, edgier subject matter,
banter and teasing, and an absence of moralising and disclaimers. That last one is doing
real work — a character that appends a safety disclaimer to everything is a character a
child stops reading and starts working around.

They do **not** buy: sexual content, dangerous instructions, secrecy from parents, or
cruelty. Those live in `SAFETY_CORE`, which the relaxed presets carry unchanged and last.

The protective variants add: no swearing, a warmer and calmer register, gentle redirection
away from distressing material, and a stronger tendency to suggest talking to a trusted
adult.

**Age band changes the register, not only the rules.** An 8-year-old and a 15-year-old need
different vocabulary, different assumptions about independence, and different handling of
school, friendship and identity topics. A 15-year-old handed the 8-year-old preset will read
it as condescension and go looking for something else to talk to. That is a safety outcome
too.

A parent can override either editable layer per child with free text. An override replaces
that layer for that user only. Clearing it (Reset) returns to the template. `SAFETY_CORE`
is appended either way — **an override cannot remove it, and cannot get in front of it.**

---

## Fallbacks — the invariant

There is no code path that sends a child's message to the model with no safety prompt.

The pipeline treats `config.json` as hostile input and validates it field by field. Every
failure mode — file absent, unreadable, not JSON, wrong shape, blank field, whitespace-only
field — falls back to the prompt constants compiled into the pipeline itself, and logs which
rung it landed on. A blank prompt is not a prompt: the backend refuses to save an empty
safety floor with a `400`, and the pipeline refuses to use one if it somehow appears.

**Unknown, missing or malformed user id → the most restrictive preset.** Not the account
default, not "no prompt". If the pipeline cannot tell who is chatting, it assumes the
youngest, most protective setting and logs it.

`SAFETY_CORE` is appended after all of that, including when every other layer has fallen
back to a built-in default.

---

## What this does not protect against

Everything above describes a **prompt**. It is worth being exact about what that means,
because the honest version is more useful than the reassuring one.

**A determined teenager can jailbreak any prompt-level control, including this one.** This
is not a defect in Ashley's rules that a better-worded rule would fix. Instruction-following
is a statistical property of a language model, not an enforcement mechanism. Given enough
attempts, a nested-fiction framing, a long enough conversation, or simply a character sheet
written specifically to erode the floor, a model can be pushed off its instructions.
`SAFETY_CORE` makes that harder and makes the default behaviour reasonable. It does not make
it impossible, and nothing at the prompt layer can.

**There is no content filter.** Ashley does not classify, score, or block model output. It
does not scan for self-harm language, grooming patterns, or anything else. What comes back
from the model is what the child reads. If you want output classification, that is a
separate system you would have to add.

**There are no alerts.** No parent is notified of anything. Nothing flags a concerning
conversation. The chat logs sit on your disk, in plain JSON, readable by anyone with the
admin password or shell access — but reading them is a thing a person does, not a thing the
software does for you.

**Model quality dominates.** Ashley composes a prompt; the model decides what to do with it.
A small quantised model follows a long, layered safety prompt considerably less reliably
than a large one. The same settings on two different endpoints are not the same safety
posture, and Ashley cannot tell you which one you have.

**A character sheet is user input inside the prompt.** It is positioned between the guardrail
and the floor, on purpose, so the floor gets the last word. But a child can write a character
specifically designed to test the boundary, and that is a normal thing for a child to do.
The layering is what makes that mostly boring rather than mostly effective.

**The safety layer is not the security layer.** The admin panel is protected by one password
with a rate limiter. Anyone with the admin password, or shell access to the host, or write
access to the config directory, can change every editable setting. Anyone who can reach the
pipeline container directly bypasses the backend's message filtering entirely — which is
exactly why it is bound to loopback and not published to the LAN. Keep it that way.

**It is not a substitute for a parent paying attention.** It reduces risk. It makes the
default behaviour reasonable. It makes the settings legible and the logs readable. It does
not supervise anyone, and it was never going to. If the arrangement you want is software
that watches a child so you do not have to, this is not that, and you should not deploy it
as though it were.

---

## What it does buy you

Having been clear about the limits, the things it does provide are real:

- **The default is not "whatever the model feels like."** Every conversation starts from a
  composed, age-appropriate prompt with a floor under it.
- **The floor cannot be edited away by accident** — not from the panel, not by a child, not
  by a misconfiguration.
- **The child cannot address the model at the guardrail's level.** The frontend can supply a
  character sheet and nothing else; every other system message is stripped server-side.
- **The failure direction is strict.** Broken config, unknown user, unreadable file — every
  one lands on more restriction, never less.
- **Nobody else is reading it.** The conversations are on your hardware. No vendor, no
  moderation contractor, no training set, no breach of someone else's database.
- **You can read the whole thing.** It is a few thousand lines of Python and the prompts are
  in the source, in plain English. You can check that it does what this page says.

---

## Reporting a bypass

If you find a way to get past `SAFETY_CORE` — a phrasing, a character-sheet construction, a
sequence that reliably works — **do not open a public issue.** A working bypass published
alongside a link to the app is a recipe with an audience. See [SECURITY.md](../SECURITY.md)
for private disclosure.
