# Infrastructure Lab (Draft)

This folder holds the Docker-based lab environment that pairs with the AI runbook executor. It is intentionally incomplete so the student can implement the real provisioning logic.

## High-level design

- `domain-controller`: Samba Active Directory container to mimic an enterprise identity provider.
- `host-alpha` / `host-beta`: Linux hosts that represent low-security endpoints for onboarding.
- Shared network `adlab` so hosts can resolve the controller (`ad-controller`).

## What still needs to be done

1. Replace the placeholder container images with real builds.
2. Implement the `scripts/ad-init.sh` script so the domain controller provisions demo users/groups.
3. Add join scripts so `host-alpha` and `host-beta` attach to the domain and expose SSH.
4. Optionally mount volumes that expose Windows shares or seed mock data for runbook demonstrations.

## Quick start (once images/scripts exist)

```bash
cd infrastructure/ad-lab
docker compose up -d
```

Verify DNS/LDAP:

```bash
docker compose exec domain-controller samba-tool user list
```

Check SSH access to the hosts to confirm onboarding steps:

```bash
docker compose exec host-alpha getent passwd demo_user
```

Tear the lab down when finished:

```bash
docker compose down -v
```

> Keep the lab isolated from production networks. This stack is for testing only.
