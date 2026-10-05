'use strict';

/* ── ASHLEY_HELP ──────────────────────────────────────────────────────
   ONE source of feature copy, read by three places:

     • the setup checklist   (assets/onboarding.js)
     • the guided tour       (assets/tour.js)
     • the help page         (pages/help.html + assets/help.js)

   Nothing here knows about the DOM. Ids, selectors, tabs and live signals
   live in the file that needs them; this file only holds words. That split
   is deliberate: in a sibling project the tour and the checklist each kept
   their own copy of the same sentences, the two drifted, and the text that
   actually shipped was the wrong one. If a sentence appears twice in this
   file, one of them is a bug.

   Written to be read by a parent, not a developer: short sentences, no
   jargon, no exclamation marks, and no promises the software cannot keep.

   Ashley AI — AGPL-3.0-or-later. Copyright and license: see the LICENSE file.
   Published under Volenti.
   ------------------------------------------------------------------- */

(function () {

  /* Bump when the wording of the acknowledgement below materially changes.
     A parent who agreed to version 1 has not agreed to a different version 2,
     so the checklist asks again. */
  const ACK_VERSION = 1;

  /* ── features ───────────────────────────────────────────────────────
     `title`  — the name of the thing, used as a heading everywhere.
     `where`  — where it lives, in a parent's words. Used by the tour.
     `short`  — one or two sentences. The tour callout and the checklist
                summary both use exactly this.
     `body`   — the longer explanation. The help page uses it; the tour
                does not (a spotlight is not the place to read four
                paragraphs).                                             */
  const features = {

    sections: {
      title: 'Finding your way around',
      where: 'The row of sections at the top',
      short:
        'Five sections: People, Rules, Model, Appearance and Password. ' +
        'Nothing here is saved until you press a Save button.',
      body: [
        'Everything in these settings sits under one of five headings. ' +
        'People is who can sign in. Rules is what Ashley is allowed to say ' +
        'to each of them. Model is the machine that does the thinking. ' +
        'Appearance is what the sign-in screen looks like. Password is the ' +
        'password for this page.',
        'You can move between them with the arrow keys as well as by ' +
        'clicking.'
      ]
    },

    model: {
      title: 'The model connection',
      where: 'Model',
      short:
        'The address of the machine that runs the language model. If this ' +
        'is wrong, Ashley looks broken: replies never arrive, or arrive empty.',
      body: [
        'Ashley does not contain a language model. It talks to one, over ' +
        'your own network, at the address you put here. A new install that ' +
        'appears to do nothing is nearly always pointed at the wrong address.',
        '"Test connection" asks that machine whether it is there and what ' +
        'models it offers. It is worth doing, but be clear about what it ' +
        'proves: it proves Ashley can reach the machine. It does not prove ' +
        'the key is right, or that the model will answer a real message. ' +
        'The only thing that proves that is an actual conversation.',
        'Longer replies need more time. If replies cut off, raise the wait.'
      ]
    },

    people: {
      title: 'One account per child',
      where: 'People',
      short:
        'Everyone who uses Ashley gets their own tile on the sign-in ' +
        'screen, their own private conversations, and their own rules.',
      body: [
        'Give each child their own account rather than sharing one. It is ' +
        'not about tidiness: rules are set per person, so two children ' +
        'sharing an account are stuck with one set of rules, and the ' +
        'younger one gets the older one\'s latitude.',
        'Conversations are private to the account they happened in. ' +
        'Characters are shared by the whole household — anyone can write a ' +
        'character and anyone can talk to it.',
        'The two small tags on each row show which rules that person is on. ' +
        'You should be able to see at a glance that a ten-year-old and a ' +
        'fifteen-year-old are not on the same settings.'
      ]
    },

    addPerson: {
      title: 'Adding someone',
      where: 'People, at the bottom',
      short:
        'A name, a colour, which rules they start on, and whether signing ' +
        'in asks for a password.',
      body: [
        'The rules you pick here are a starting point, not a commitment. ' +
        'You can change them afterwards, and you can rewrite them for that ' +
        'one person without touching anybody else.'
      ]
    },

    whoseRules: {
      title: 'Whose rules you are looking at',
      where: 'Rules',
      short:
        'Rules are per person. Choose a name first; everything after that ' +
        'applies to them alone.',
      body: [
        'There is no global set of rules any more. Every person has their ' +
        'own, and changing one person\'s wording never changes anybody ' +
        'else\'s.'
      ]
    },

    templates: {
      title: 'The four templates',
      where: 'Rules, after choosing a person',
      short:
        'Two age bands, each in a protective and a relaxed version. The ' +
        'relaxed ones are looser in tone, never looser on safety.',
      body: [
        'There are four: a protective and a relaxed template for ages 8 to ' +
        '12, and the same pair for ages 13 to 16.',
        'The age band changes how a character talks — vocabulary, how much ' +
        'independence it assumes, how it handles school, friendships and ' +
        'growing up. It is not only a stricter or looser version of the ' +
        'same thing.',
        'The relaxed versions buy tone and nothing else: casual swearing, ' +
        'dark humour, sarcasm, edgier subject matter, teasing, and no ' +
        'moralising. They do not buy sexual content, real instructions for ' +
        'dangerous things, secrecy from parents, or cruelty. Those are ' +
        'blocked for everybody, on every template.',
        'Each template has a paragraph next to it describing what it is ' +
        'for. Read those before choosing — they are the product, not ' +
        'decoration.'
      ]
    },

    editors: {
      title: 'Rewriting the rules for one person',
      where: 'Rules, after choosing a person',
      short:
        'Two boxes: how characters should behave, and the safety rules ' +
        'that come after the character. Each says whether it is still on ' +
        'the template or has been rewritten.',
      body: [
        'The first box is tone and manner — how a character stays in ' +
        'character, and what it does with an awkward subject. It is safe to ' +
        'experiment with.',
        'The second box is the safety layer for that person. It is sent ' +
        'after the character description, which means it has the last word. ' +
        'Weakening or emptying it is what lets unsafe replies through.',
        'The small label above each box tells you where it stands: "Using ' +
        'the template", "Customised", or "Not saved yet". Neither box can ' +
        'be saved empty.'
      ]
    },

    resetTemplate: {
      title: 'Putting a box back to its template',
      where: 'Rules, next to each box',
      short:
        'Every box has its own "Reset to template". There is also a ' +
        'household-wide button that puts the four templates back to the ' +
        'wording Ashley shipped with.',
      body: [
        '"Reset to template" on a box discards what you wrote there and ' +
        'goes back to that person\'s template. It affects that one box for ' +
        'that one person.',
        '"Restore the four templates" is different and lives on the list of ' +
        'people. It puts the four shipped templates back to Ashley\'s own ' +
        'wording. It deliberately leaves alone anything you have written ' +
        'for an individual — a button labelled "restore defaults" should ' +
        'not quietly delete your work.'
      ]
    },

    core: {
      title: 'The rules that are always on',
      where: 'Rules, at the bottom, in the dashed box',
      short:
        'A short set of rules applied to every person, on every template, ' +
        'after everything else. They cannot be edited from this page.',
      body: [
        'These cover the things that do not vary by age or by tone: nothing ' +
        'sexual; no real instructions for genuinely dangerous things; ' +
        'nothing that demeans or targets a real person; no physical ' +
        'intimidation or intimacy; and the one that matters most — a ' +
        'character must never agree to keep secrets from you, never present ' +
        'itself as the only one who understands the child, and never offer ' +
        'itself as the alternative to telling a trusted adult.',
        'They are added last, so they outrank the character sheet and ' +
        'anything written in the two boxes above.',
        'They are shown read-only on purpose. Changing them means editing ' +
        'the source code and restarting — a deliberate speed bump, so that ' +
        'the floor cannot be lowered by a misclick at eleven at night.'
      ]
    },

    passwords: {
      title: 'Passwords for the children',
      where: 'People, under "Change"',
      short:
        'Optional, per person. Without one, a tap on their tile signs them ' +
        'in. This is a decision to make on purpose, not one to leave unread.',
      body: [
        'A password on a child\'s account keeps their conversations from ' +
        'their siblings. It does not keep anything from you: you can read ' +
        'every conversation from the machine this runs on, whatever ' +
        'passwords are set.',
        'Leaving passwords off is a perfectly reasonable choice on a family ' +
        'device, especially for a younger child who will forget one. The ' +
        'point is that you chose, rather than never noticing the setting.'
      ]
    },

    adminPassword: {
      title: 'The parents\' password',
      where: 'Password',
      short:
        'The password for this settings page. It is not any child\'s ' +
        'sign-in password, and it is the only thing standing between them ' +
        'and their own rules.',
      body: [
        'Anyone who has this password can change every child\'s rules. ' +
        'Choose something the children will not guess, and do not use the ' +
        'same one you gave them for their tile.',
        'If you forget it, it can be reset from the machine Ashley runs on ' +
        '— see "If you forget the parents\' password" below. There is no ' +
        'reset by email, because there is no email and no account anywhere ' +
        'but here.'
      ]
    },

    appearance: {
      title: 'Appearance',
      where: 'Appearance',
      short:
        'What the sign-in screen looks like for anyone who has not chosen ' +
        'their own. Five themes; everybody can pick a different one inside ' +
        'the app.',
      body: [
        'Purely cosmetic. Nothing here changes what a character may say.'
      ]
    },

    firstChat: {
      title: 'The first conversation',
      where: 'The app itself',
      short:
        'Talk to a character yourself, once, before your child does. It is ' +
        'the only way to see what they will see.',
      body: [
        'Every check on this page tests a setting. None of them tests the ' +
        'thing that actually matters, which is what comes back when someone ' +
        'types a message. A five-minute conversation tells you more than ' +
        'the whole of this panel.',
        'Try it as your child would: pick a character, say something ' +
        'ordinary, then push a little at the edges and watch how it ' +
        'handles that.',
        'One practical note. This device can hold one sign-in at a time, so ' +
        'signing in as one of the children replaces your parents\' session ' +
        'here. Come back to the settings page afterwards and enter the ' +
        'parents\' password again.'
      ]
    },

    setup: {
      title: 'The setup checklist',
      where: 'At the top of these settings',
      short:
        'Six things worth doing on a new install. Each one ticks itself ' +
        'when it is genuinely done, not when you press Next.',
      body: [
        'It never disappears. Come back to it after adding a child, or ' +
        'after changing where the model lives, and run through it again.'
      ]
    },

    dataLocation: {
      title: 'Where the data lives',
      where: 'On this machine',
      short:
        'Everything is a plain file on the machine Ashley runs on. Nothing ' +
        'is sent anywhere else, and nothing is encrypted at rest.',
      body: [
        'Conversations, accounts, characters and settings are ordinary ' +
        'files under the data folder that was chosen when Ashley was ' +
        'installed. Conversations are stored per person, as plain text.',
        'That has two consequences and you should hold both. Nothing your ' +
        'child says goes to a company, and nobody is training on it. And ' +
        'anybody with access to that machine — including you — can read ' +
        'every conversation without a password.',
        'Deleting a person from the People section deletes their ' +
        'conversations with them. That cannot be undone.',
        'The language model itself is a separate machine on your network. ' +
        'Messages are sent to it to be answered. What it keeps, if ' +
        'anything, is up to how that machine is set up.'
      ]
    }
  };

  /* ── the honesty statement ──────────────────────────────────────────
     Read once, acknowledged once, and repeated on the help page. Written
     as respect for the parent's judgement rather than as a disclaimer:
     the aim is a parent who knows what they are relying on, not a parent
     who has clicked past a wall of red text.                           */
  const honesty = {
    title: 'What this does, and what it does not',
    intro:
      'Before you hand this to a child, it is worth being straight with ' +
      'you about what you are relying on.',
    points: [
      {
        h: 'This is prompt-level safety.',
        p:
          'The rules are instructions written around every message, in the ' +
          'same channel the conversation happens in. They are not a filter ' +
          'sitting between the child and the model, and they are not a ' +
          'separate system checking the replies afterwards.'
      },
      {
        h: 'It reduces risk. It does not remove it.',
        p:
          'The rules go last, so they carry weight, and in ordinary use ' +
          'they hold. But a language model can still produce something you ' +
          'would not want, without anybody trying to make it.'
      },
      {
        h: 'A determined teenager can get around it.',
        p:
          'Anyone patient enough to keep rephrasing can eventually talk a ' +
          'model past instructions like these. This is true of every ' +
          'product built this way, including the large commercial ones. If ' +
          'your child is the sort to go looking, assume they will find a ' +
          'way, and plan for that rather than around it.'
      },
      {
        h: 'Conversations are stored here, unencrypted, and you can read them.',
        p:
          'Every message is a plain file on this machine. A password on a ' +
          'child\'s account keeps their siblings out; it does not keep you ' +
          'out. Whether you read them is your call — but you should decide ' +
          'that knowingly, and it is fairer to tell your child that you can.'
      },
      {
        h: 'It is not a substitute for paying attention.',
        p:
          'The most useful thing on this page is not a setting. It is ' +
          'knowing roughly who your child talks to and what about, and ' +
          'them knowing they can tell you if something goes wrong.'
      }
    ],
    close:
      'None of this means the controls are not worth setting. It means ' +
      'they are a floor, not a fence.',
    confirm: 'I have read this'
  };

  /* ── the checklist ──────────────────────────────────────────────────
     Order is deliberate: the model first, because a misconfigured
     endpoint makes a working install look broken and sends people
     hunting for problems that are not there.

     `lead` is what to do. `why` is the one line that says why it is on
     the list at all. The title and the summary come from the feature, so
     they cannot drift from the tour.                                    */
  const steps = [
    {
      id: 'model',
      feature: 'model',
      lead: 'Check Ashley can reach the machine that runs the model.',
      why: 'A wrong address is the most common reason a new install looks broken.'
    },
    {
      id: 'safety',
      feature: 'core',
      lead: 'Read the rules that are always on, and what they can and cannot do.',
      why: 'It is the one step here that is about your judgement rather than a setting.'
    },
    {
      id: 'accounts',
      feature: 'people',
      lead: 'Give each child their own account.',
      why: 'Rules are set per person, so a shared account means shared rules.'
    },
    {
      id: 'presets',
      feature: 'templates',
      lead: 'Choose the rules for each child, and check the ones you have not looked at.',
      why: 'A child nobody reviewed is the state this whole page exists to prevent.'
    },
    {
      id: 'passwords',
      feature: 'passwords',
      lead: 'Decide whether each child signs in with a password.',
      why: 'Either answer is fine. Not having decided is the problem.'
    },
    {
      id: 'firstchat',
      feature: 'firstChat',
      lead: 'Have a conversation yourself, as your child would.',
      why: 'Nothing on this page tells you what the replies actually sound like.'
    }
  ];

  /* ── the tour ───────────────────────────────────────────────────────
     Copy only. Which element each step points at, and which section has
     to be open first, live in assets/tour.js next to the code that has
     to keep them honest.                                                */
  const tour = [
    { id: 'sections', feature: 'sections' },
    { id: 'people', feature: 'people' },
    { id: 'addPerson', feature: 'addPerson' },
    { id: 'whoseRules', feature: 'whoseRules' },
    { id: 'resetTemplate', feature: 'resetTemplate' },
    { id: 'templates', feature: 'templates' },
    { id: 'editors', feature: 'editors' },
    { id: 'core', feature: 'core' },
    { id: 'model', feature: 'model' },
    { id: 'appearance', feature: 'appearance' },
    { id: 'adminPassword', feature: 'adminPassword' },
    { id: 'setup', feature: 'setup' }
  ];

  /* ── help page only ─────────────────────────────────────────────────
     Things that are not a control in the panel, so they have no tour
     step and no checklist step, but a parent still needs them written
     down somewhere.                                                     */
  const extra = {

    what: {
      title: 'What Ashley is',
      body: [
        'Ashley is a character-chat app that runs on your own hardware. A ' +
        'child writes characters — a name, a personality, a backstory — and ' +
        'talks to them. A parent sets what those characters are allowed to ' +
        'be like.',
        'Nothing goes to a company. The app talks to a language model on ' +
        'your own network, and every conversation stays on the machine ' +
        'Ashley runs on.'
      ]
    },

    layers: {
      title: 'How the rules fit together',
      body: [
        'Three things are sent to the model with every message, in this ' +
        'order: the rules for that person, then the character the child ' +
        'wrote, then the safety rules for that person, then the rules that ' +
        'are always on.',
        'The order is the point. What comes last carries the most weight, ' +
        'so the safety layers come after the character. When they came ' +
        'first, a strong character description could out-pull them.',
        'A child cannot reach any of this. The app only ever sends the ' +
        'character sheet and the conversation; the rules are added on the ' +
        'server, out of reach of anything typed into the message box.'
      ]
    },

    adminReset: {
      title: 'If you forget the parents\' password',
      body: [
        'There is no email reset, because Ashley has no account system and ' +
        'no way to reach you. The reset happens on the machine it runs on.',
        'Set ASHLEY_ADMIN_PASSWORD in the environment file next to the ' +
        'compose file, then restart Ashley. That value is re-applied on ' +
        'every start, so editing it and restarting is the supported way ' +
        'back in.',
        'If no password has ever been set, Ashley generates one on first ' +
        'start, writes it to a file next to the other account data, and ' +
        'prints it to its own log. It shows it once on the sign-in screen ' +
        'too, until you change it.'
      ]
    },

    trouble: {
      title: 'When something looks wrong',
      body: [
        'Replies never arrive, or arrive empty: the model address is the ' +
        'first thing to check, then whether the machine running the model ' +
        'is actually up. "Test connection" on the Model section answers ' +
        'the first half of that.',
        'Replies stop halfway: raise the wait on the Model section. A ' +
        'slower machine writing a long reply can exceed it.',
        'A character behaves in a way you did not expect: open that ' +
        'person\'s rules and read what is actually in the two boxes. If ' +
        'either says "Customised", somebody rewrote it — press "Reset to ' +
        'template" to get back to known ground.',
        'Nobody can sign in: if there is no tile on the sign-in screen, ' +
        'no accounts exist yet. Add one from the People section.'
      ]
    }
  };

  window.ASHLEY_HELP = {
    ACK_VERSION: ACK_VERSION,
    features: features,
    honesty: honesty,
    steps: steps,
    tour: tour,
    extra: extra,

    /* Small readers so nothing downstream has to guess at the shape, and a
       missing id fails visibly rather than rendering "undefined". */
    feature: function (id) {
      return features[id] || { title: id, where: '', short: '', body: [] };
    }
  };
})();
