# n8n-nodes-albacross

[n8n](https://n8n.io/) community node package for
[Albacross](https://albacross.com). Lets your n8n workflows react in real time
to identified-company leads tracked by Albacross.

## What's in the package

- **Albacross API** credential — stores the n8n API key you generate inside
  Albacross and verifies it on save by calling `GET /n8n/me`.
- **Albacross Trigger** node — webhook-style trigger that registers itself
  with Albacross on workflow activation and receives lead events as they
  happen. Supports filtering by segment, buyer-persona keyword source, and
  send-mode (every match vs. one-per-company).

## Requirements

- n8n version `1.0` or later (community nodes are supported on both
  self-hosted and Cloud installations with verified community nodes enabled).
- An Albacross account with an n8n API key (see *Credentials* below).
- Node.js `>= 20.15` if you are installing the node manually.

## Installation

### From the n8n editor (recommended)

1. Open **Settings → Community Nodes** in your n8n instance.
2. Click **Install a community node**.
3. Enter `n8n-nodes-albacross` and confirm the install.

n8n Cloud users need to have verified community nodes enabled. On
self-hosted instances the feature is available out of the box once the
admin has [allowed community nodes](https://docs.n8n.io/hosting/configuration/community-nodes/).

### Manual install

```bash
npm install n8n-nodes-albacross
```

Then restart your n8n instance so it picks up the new node and credential.

## Credentials

1. Log in to your Albacross account.
2. Go to **Settings → Integrations → n8n** to copy the API key.
3. In n8n, create a new **Albacross API** credential and paste the API key into
   the **API Key** field.
4. Click **Save**. n8n will verify the key by calling `GET /n8n/me` against
   the Albacross API.

## Using the Albacross Trigger node

Drop the **Albacross Trigger** node onto your canvas to start a workflow
whenever Albacross identifies a matching company.

### Parameters

| Parameter | Description |
|---|---|
| **Segment** | Restrict the trigger to companies in a specific Albacross segment. Choose **All companies** to receive every identified lead. The dropdown is populated from your account's segments. |
| **Send mode** | `Send New and Returning Companies` fires the workflow for every qualifying event. `Send Only New Companies` debounces so each company only triggers once. |
| **Contacts** | Optionally enrich the lead payload with matching contacts. Filter by buyer-persona keyword source and country. |

### What happens on activation, edit, and deactivation

- **Activation** — the node registers a webhook with Albacross by calling
  `POST /n8n/hooks`. Albacross records the n8n webhook URL and starts
  routing matching leads to it. The hook id is stored on the workflow so
  later edits can patch the same record.
- **Editing parameters** — the node diffs your changes and `PATCH`es only
  the fields that changed.
- **Deactivation** — the node calls `DELETE /n8n/hooks/:id` and Albacross
  stops sending events to that workflow.

### Receiving leads

When Albacross matches a lead against your segment, it POSTs the lead to
the n8n webhook URL the trigger registered. The payload contains the
company information, any requested contacts, and event metadata. The
workflow starts with that payload as the first item.

## Troubleshooting

- **`Authentication failed` when saving the credential** — double-check
  the API key is the one generated under **Settings → Integrations → n8n** in
  Albacross, and not a different access token. Generate a new key if you
  are unsure.
- **No events arriving after activation** — confirm in Albacross that the
  connector appears under your account's active n8n connectors, and check
  that the workflow's n8n webhook is reachable from the public internet.
- **Segment dropdown is empty** — your account may not have any segments
  yet. Create one in Albacross first, or pick **All companies**.

## Support

- Issues with this package: please file a GitHub issue on
  [albacross/n8n-nodes-albacross](https://github.com/albacross/n8n-nodes-albacross/issues).
- Questions about your Albacross account, API keys, or segments:
  contact [developers@albacross.com](mailto:developers@albacross.com).

## Development

This package is scaffolded with the official
[`@n8n/node-cli`](https://www.npmjs.com/package/@n8n/node-cli).

```bash
npm install
npm run build      # transpile TypeScript to dist/
npm run lint       # n8n-node lint (includes community-node scanner)
npm test           # jest unit tests
npm run dev        # run a local n8n instance with this node loaded
```

Pull requests are welcome.

## Resources

- [n8n community nodes documentation](https://docs.n8n.io/integrations/#community-nodes)

## License

[MIT](LICENSE)
