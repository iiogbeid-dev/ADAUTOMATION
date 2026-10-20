AD Lab Environment
==================

This docker-compose stack spins up a self-contained Active Directory demo environment to back the automation workflows.

Components
----------

- `domain-controller`: Samba-based AD DC (`EXAMPLE.LOCAL`) provisioned on first boot and seeded with demo OUs, groups, and accounts (`alice.johnson`, `bob.smith`).
- `machine01`, `machine02`: Debian SSH hosts that auto-join the domain under `OU=Workstations`. Each exposes SSH on ports `2221`/`2222`.

Usage
-----

```
cd infrastructure/ad-lab
docker compose build
docker compose up -d
```

Once the stack is online:

- `docker compose logs -f domain-controller` shows Samba startup and seeding steps.
- `docker compose exec domain-controller samba-tool user list` enumerates AD accounts.
- `ssh root@localhost -p 2221` (password `ChangeMe123!`) connects to `machine01`.

Teardown with `docker compose down -v` to remove containers and volumes.

Environment Variables
---------------------

Adjust defaults via the compose file:

- `SAMBA_DOMAIN`, `SAMBA_REALM`, `SAMBA_ADMIN_PASSWORD` control the AD domain.
- Host containers accept `JOIN_DOMAIN`, `DOMAIN_REALM`, `DOMAIN_ADMIN_*`, and `DC_HOST` to customise the join process or skip domain membership.

Next Steps
----------

Hook the backend executor into this lab by mapping the YAML actions to `samba-tool` and SSH operations (user provisioning, group membership, GPO rollout). The `llm:prompt` CLI and UI can now target live infrastructure to demonstrate end-to-end automations.
