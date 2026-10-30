# dsh-prompt-recall

**Take the last prompt back.** One icon sits under the newest prompt you sent — in
the same row as *copy*, and drawn by the shipped action-button style. Clicking it
stops the running turn, rewinds the conversation to just before that prompt, and
puts its text back in the message box to edit and send again.

**English** | [简体中文](README.zh-CN.md)

[![License](https://img.shields.io/github/license/icrefin/dsh-prompt-recall?style=flat-square)](LICENSE)
[![Release](https://img.shields.io/github/v/release/icrefin/dsh-prompt-recall?style=flat-square)](https://github.com/icrefin/dsh-prompt-recall/releases/tag/v0.1.3)
[![CI](https://img.shields.io/github/actions/workflow/status/icrefin/dsh-prompt-recall/ci.yml?branch=main&style=flat-square)](https://github.com/icrefin/dsh-prompt-recall/actions/workflows/ci.yml)
[![Last commit](https://img.shields.io/github/last-commit/icrefin/dsh-prompt-recall?style=flat-square)](https://github.com/icrefin/dsh-prompt-recall/commits/main)
[![Stars](https://img.shields.io/github/stars/icrefin/dsh-prompt-recall?style=flat-square)](https://github.com/icrefin/dsh-prompt-recall/stargazers)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-brightgreen?style=flat-square)](https://github.com/icrefin/dsh-prompt-recall/pulls)
[![Node](https://img.shields.io/badge/node-%3E%3D22.17-339933?style=flat-square&logo=node.js)](https://nodejs.org)
[![dsh](https://img.shields.io/badge/dsh-0.2.1--rc.5-4B5563?style=flat-square)](https://github.com/deepseek-ai/deepseek-harness)

## The moment it removes

You sent a prompt, realised the wording was wrong halfway through the answer, and
now you have two bad options: let the turn finish and type a correction, or stop it
and retype the whole prompt. Recall is the third one.

```
                                          before  ⇢  after one click
   ┌───────────────────────────────────┐   ┌────────────────────────────────────┐
   │ ▸ you                              │   │ ▸ you                              │
   │   summarise the retry logic in     │   │   (previous turn, untouched)       │
   │   relay/README.md and open a PR    │   │                                    │
   │                          09:26 ⧉ ↻ │   ├────────────────────────────────────┤
   ├───────────────────────────────────┤   │ ✎ summarise the retry policy       │
   │ ▸ Deep diving… (still running)     │   │   again, in three bullets          │
   │                                    │   │                              ↑     │
   └───────────────────────────────────┘   └── cursor here, ready to resend ─────┘
            09:26 = timestamp   ⧉ = copy   ↻ = recall
```

## What it contributes

| Surface | What it does |
|---|---|
| the newest prompt's action row | adds one icon button beside the shipped *copy* button, styled by that button's own class |
| Locale namespace `dsh-prompt-recall` | English and Simplified Chinese copy for the tooltip, the busy state, and the three failure notices |
| `conversation.input.right` | hosts the controller that owns the button and drains a recalled draft into the composer — it renders no visible control of its own |

No host route, no host service, no Config. The host half (`exports["."]`) exists
only so the Loader row can carry the browser half (`exports["./client"]`).

## What one click does

```
on(recall)
  stop     the session scope's conversation.cancel()          # the Stop button's operation
  plan     read the prompt's text + seq from the event window
  rewind   sessions.fork({ sessionId, atSeq: boundary })      # the branch button's operation
  stage    hand the text to the child session's composer
  open     navigate to the child session
  retire   archive the session the gesture came from          # the ⌘⇧A operation
```

1. **Stop.** The in-flight turn is cancelled on its own session scope, exactly as
   the composer's Stop button does it. A rejection here is swallowed — an idle
   session has nothing to cancel, and that must not block the rewind.
2. **Rewind.** The conversation continues from an exact prefix of its own log.
3. **Restore.** The recalled text is staged for the child session's composer and
   applied as it mounts, then the caret is returned to it.
4. **Retire.** The session the gesture came from moves to the archive set, so the
   conversation exists once — the sidebar shows where you are, not everywhere you
   have been. This runs **last**, after the navigation: archiving the session on
   screen clears the main panel, so doing it first would blank the view before the
   child opens.

## Why the conversation continues in a new session

A Session log is an append-only durable record, and a live Agent holds it open.
There is no "delete the last turn" operation, and rewriting the log under a running
Agent would corrupt the session. The platform's own answer to *continue from an
earlier point* is `session/fork` — copy an exact event prefix into a new Session —
which is precisely what the shipped **branch** action does.

Recall is that same operation, cut at a different boundary:

| | cut at | you get |
|---|---|---|
| branch (shipped) | the end of the turn you forked from | a copy of everything, to try a different continuation |
| recall (this plugin) | just before the prompt was queued | a continuation whose history does not contain that prompt |

The child keeps the working directory, the agent preset and the workspace, and its
title increments, so the sidebar never shows two indistinguishable rows.

Recall is repeatable: every recall cuts one prompt further back and retires the
session it came from, so a rewind chain always presents exactly one visible
conversation.

## What happens to the old session: archive, not delete

A fork on its own would leave the conversation standing twice. So recall retires
the session it came from — and the operation DSH offers for that is **archive**.
There is no session delete anywhere in the platform (`archiveSession` /
`unarchiveSession` are the whole vocabulary; the `_deleteSession` in the session
index is search-cache maintenance, and `workspaces.delete` removes a *workspace*).
That suits this gesture:

- **the log is untouched** — the withdrawn prompt is still inside the retired
  session, so nothing is lost, and `unarchiveSession` returns it to its old place
  in the list;
- **it strengthens the withdrawal** — the durable archive set is what a provider's
  `agent/pre-step` wake gate reads, so a retired session cannot be woken into
  re-running the prompt you just took back;
- **it is the same durable state the shipped ⌘⇧A shortcut writes**, with
  `stopActivity` — the escalation DSH's own confirmation offers when a session has
  work in flight, which recall has already decided for you.

**Getting one back:** the sidebar's view options filter sessions by archived
state (`default` / `show` / `only`), and a session search result for an archived
session carries an unarchive button. No file editing, no restart.

If retiring fails — a session the registry does not know yet is the usual cause —
the recall keeps everything it already did and says so in the new conversation
("the previous session could not be archived — it is still in the sidebar")
rather than throwing the gesture away.

Recall is **not offered inside a subagent session**: its transcript is its
parent's evidence rather than a conversation, so forking it would mint an ordinary
session out of a subagent prefix, and retiring it would remove it from its
parent's catalog.

## Where the button is placed, and why it is placed by DOM

The Chat view exposes no slot for a *user* message's action row.
`conversation.chat.assistant-actions` and `conversation.chat.turnTail` both render
for a **completed** turn, so neither exists while the Agent is still working —
which is exactly when a recall button has to be reachable. Shadowing the whole
`conversation.chat.node` entry for the `user` kind would mean re-implementing the
shipped bubble, its reference chips, its attachments and its stylesheet, and
drifting from them on every Harness update.

So the controller addresses the shipped row through the same public DOM contract
the row's own stylesheet uses, scoped to the Conversation occurrence that contains
its own composer:

| selector | what it identifies |
|---|---|
| `[data-conversation-content]` | one Conversation occurrence; tagged `data-conversation-session` |
| `[data-chat-flow-kind="user"]` | one user (or steering) message flow item |
| `[data-clock="start"]` | the action row itself — where copy renders |

and it takes the **newest visible** user row, so the button follows the
conversation. It also copies the live `class` attribute off the sibling *copy*
button, which is why it is pixel-identical now and after a Harness restyle: the
rule that styles copy styles recall. The plugin's own stylesheet is a fallback,
selected only when no sibling class could be copied (`:not([class])`).

The placement is re-resolved from a `MutationObserver` rather than during render,
because the row is rendered by another React root and the commit order between the
two is not defined. The button itself is a React portal, so it keeps React's
lifecycle, its tooltip and its handlers while living in the transcript's DOM.

## Reading the prompt, and choosing the boundary

Both facts come from the Session binding's own event window
(`SessionBinding.eventSource`) — the same contiguous, session-authorized source the
Chat view assembles its transcript from. Nothing is scraped from the DOM, so the
recalled text is the prompt exactly as it was sent, not its presentation
projection.

```
on(plan)
  prompt   = newest user/message whose source.kind is "user" and surfaceOp is append
  boundary = the event immediately before the Inbox splice that queued `prompt`
             (falling back to the enclosing turn/start)
  if boundary < 0
    boundary = none      # the prompt was the session's first event
```

**The boundary is not `seq - 1`.** A prompt reaches the Agent through the Inbox:
the composer splices it in, and the claim that removes it is a *later* event.
Cutting at `promptSeq - 1` would leave a prefix whose folded Inbox still holds the
prompt as pending work — the child session would carry the withdrawn prompt as a
queued message, and a resumed Agent could run it again. Cutting immediately before
the splice is the last event that has to go for the prompt to be gone.

`source.kind === "user"` is also what makes "the newest prompt" mean *your* newest
prompt: the Host writes `user/message` events for workspace instructions, runtime
context, approvals and Inbox notices too, and none of those is something a user can
recall.

## What comes back, and what does not

| | |
|---|---|
| ✅ the prompt text | exactly what was sent, including `/commands` and `@references` in their sent form |
| ❌ attachments | an image or file on the recalled prompt is not re-attached; the text is restored and you re-pick the file |
| ❌ earlier turns | they are not touched — recall moves the *end* of the conversation, never its beginning |

A recalled draft is only ever written into an **empty** composer. If you start
typing while the hand-off is in flight, your text wins, and the plugin tells you
the recalled prompt could not be placed instead of overwriting you.

## When there is nothing to rewind to

If the prompt you are recalling is the session's very first event, no prefix exists
to fork. Recall then continues the conversation in a **new blank session** in the
same working directory — same net effect, one session further from the original —
rather than refusing the gesture.

## Files

```
src/
├── index.ts                 # host half: the Loader row's inert entry point
├── version.ts               # the one version string the package reports
└── client/
    ├── index.tsx            # registration: dictionaries, styles, the controller entry
    ├── window.ts            # the prompt + boundary rules (pure)
    ├── recall.ts            # the gesture, expressed against its ports (pure)
    ├── RecallAction.tsx     # the controller component: portal button + draft drain
    ├── anchor.ts            # the DOM contract the button is placed through
    ├── staging.ts           # the recalled text's short stay between two sessions
    ├── locales.ts           # en / zh dictionaries
    ├── styles.ts            # fallback action-button rules
    └── primitives.d.ts      # the bootstrap static module's two members this plugin uses
test/                        # window rules, gesture ordering, DOM anchor, manifest mirror
tools/
├── e2e-recall.mjs           # drives a real Chromium over CDP through the whole gesture
└── seed-dev-home.mjs        # seeds an isolated dev profile with one real session
```

`window.ts` and `recall.ts` are pure and hold every rule worth arguing about; the
component only wires them to a DOM row and a composer.

## Installing

The desktop profile is owned by the Electron application, so install through
**Settings → Plugins** (or the `plugin_manager` tool) and give it this path:

```
dsh-prompt-recall/dist/dsh-prompt-recall-0.1.2.tgz
```

```sh
scripts/install.sh                 # pack, then print the path above
scripts/install.sh --profile tui   # pack, then install into a CLI-managed profile
```

Then **restart the app**: a bundle added to a running profile cannot be imported by
that process until the next start.

## Development

```sh
pnpm install
pnpm check          # typecheck both halves · build the bundle · run the suite
```

To exercise the real thing without touching the profile the desktop app is using:

```sh
scripts/dev-profile.sh boot 19498            # isolated DSH home under .dev-home/
node tools/seed-dev-home.mjs \
  ~/.dsh/sessions/<store>/<session> /path/to/workspace   # needs the host stopped
scripts/dev-profile.sh boot 19498            # restart on the seeded fixture
node tools/e2e-recall.mjs "<printed url>" "<session title>" "<prompt prefix>"
scripts/dev-profile.sh remove
```

The end-to-end driver asserts the whole gesture in a headless Chromium: the button
is mounted inside the newest prompt's shipped action row, it carries the shipped
action class, the click continues the conversation in a new session, the withdrawn
prompt leaves the transcript, its text is back in the composer, and the session it
came from landed in the Host's durable archive set (read off the dev home's
registry — the promise is a registry write, not a render). It fails the run on any
page exception or `console.error`, so a client plugin that throws cannot pass by
accident.

The fixture's session is idle (the isolated dev home has no model credentials, so
a turn cannot be started there). That leaves one path covered by the suite rather
than by the browser run: **recall while the Agent is working** — that the stop is
issued first, and that a rejected stop does not block the rewind, are pinned by
`test/recall.spec.ts`.

## Known limitations

- **Recall is not undo of the model's work.** A turn that already ran tools leaves
  those effects behind; the rewind removes the prompt from the conversation, not
  what the filesystem did in the meantime.
- **The child session is a real session.** It appears in the sidebar and counts
  against the session list, exactly like a branch does.
- **The retired session is archived, not deleted** — it stays on disk, leaves the
  default sidebar list, and comes back with unarchive. If you would rather keep
  the pre-recall session visible, unarchive it after the gesture; there is no
  session delete in DSH to offer instead.
- **The placement contract is DSH's DOM.** If a future Harness renames
  `data-chat-flow-kind`, `data-clock` or the action-button class, the button
  disappears (it fails soft — no crash, no broken row). The three selectors are
  declared in one place, `anchor.ts`, with its tests.
- **Attachments are not restored** — see the table above.

## Contributing

Issues and pull requests are welcome — the bug form asks which step of the gesture
broke, which is usually enough to reproduce. [CONTRIBUTING.md](.github/CONTRIBUTING.md)
has the commands and the map of what each spec pins. Report vulnerabilities through
[SECURITY.md](.github/SECURITY.md) rather than a public issue. This project follows the
[Contributor Covenant](.github/CODE_OF_CONDUCT.md).

> If this button saves you from retyping a prompt, a ⭐ star helps other DSH
> users find it.

## License

MIT — see [LICENSE](LICENSE).