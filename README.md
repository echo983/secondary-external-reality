# secondary-external-reality

An experimental world kernel for a text-based “secondary external reality”.

The first implementation target is the protocol boundary between LLM-proposed
world changes and deterministic validation. See
[`docs/MVP-world-kernel-protocol-v0.1.md`](docs/MVP-world-kernel-protocol-v0.1.md).

The current vertical slices support opening the bedroom door and writing an
exact numeric inscription on a paper note, hiding it under the pillow, then
finding and reading it after unrelated actions or a process restart.

The generic object-operation MVP also supports taking portable objects,
placing them on surfaces or inside open containers, opening/closing containers,
and observing them through event-sourced temporal relations.

Explicit multi-action `ttd` inputs are executed step by step. If a later step
fails, earlier committed actions remain true and the response reports partial
success instead of rolling the world back.

Each input also has a durable root-turn audit trail. Successful steps link to
their authoritative world commits; failed attempts are recorded separately in
`turn_attempts` and never become world truth.

If a process stops after a world commit but before its success audit is written,
the next session reconstructs the missing audit from the authoritative commit.

Every new world commit is preflighted against a closed MVP schema and a fully
replayed future-world copy before LanceDB append. Entity projection changes must
also carry matching entity-attribute commitments. A filesystem writer lock and
expected world sequence serialize commits across local server processes.

The object fixture is currently version `0.3.0`. Its seed now includes the
player posture and position used by the unified state model; databases committed
against `0.2.0` are intentionally rejected rather than silently migrated.

## Development

```sh
npm install
npm test
```

## Run the SSH MVP

Generate a local host key and create a password file. Both remain under the
git-ignored `secret/` directory:

```sh
ssh-keygen -t ed25519 -f secret/ssh_host_ed25519_key -N ''
printf '%s\n' 'replace-with-a-long-local-password' > secret/ssh_password
chmod 600 secret/ssh_password secret/ssh_host_ed25519_key
```

Build and start the loopback-only server:

```sh
npm run build
SER_SSH_HOST_KEY_PATH=secret/ssh_host_ed25519_key \
SER_SSH_PASSWORD_FILE=secret/ssh_password \
npm run start:ssh
```

In another terminal, connect with an ordinary SSH client:

```sh
ssh ttd@127.0.0.1 -p 2222
```

The Cloudflare API token defaults to `secret/cftoken.txt`, and the LanceDB
world defaults to `.world/world.lancedb`. The server intentionally binds only
to `127.0.0.1`; public exposure and stronger authentication are separate
deployment work, not implicit defaults.
