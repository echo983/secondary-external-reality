# secondary-external-reality

An experimental world kernel for a text-based “secondary external reality”.

The first implementation target is the protocol boundary between LLM-proposed
world changes and deterministic validation. See
[`docs/MVP-world-kernel-protocol-v0.1.md`](docs/MVP-world-kernel-protocol-v0.1.md).

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
