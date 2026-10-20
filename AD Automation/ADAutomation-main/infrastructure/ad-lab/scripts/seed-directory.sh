#!/usr/bin/env bash
set -euo pipefail

DOMAIN="${SAMBA_DOMAIN:-EXAMPLE}"
REALM="${SAMBA_REALM:-EXAMPLE.LOCAL}"

upper_realm="${REALM^^}"
IFS='.' read -r -a realm_parts <<< "${upper_realm}"
base_dn=""
for part in "${realm_parts[@]}"; do
  if [ -z "${base_dn}" ]; then
    base_dn="DC=${part}"
  else
    base_dn="${base_dn},DC=${part}"
  fi
done

USERS_OU="OU=Users,${base_dn}"
GROUPS_OU="OU=Groups,${base_dn}"
WORKSTATIONS_OU="OU=Workstations,${base_dn}"

ensure_ou() {
  local ou_dn="$1"
  if samba-tool ou list | grep -Fqx "${ou_dn}"; then
    echo "[seed] OU already exists: ${ou_dn}"
  else
    echo "[seed] Creating OU: ${ou_dn}"
    samba-tool ou create "${ou_dn}" || echo "[seed] OU create returned non-zero (possibly already exists)."
  fi
}

ensure_group() {
  local group_name="$1"
  local group_ou="$2"
  if samba-tool group show "${group_name}" >/dev/null 2>&1; then
    echo "[seed] Group exists: ${group_name}"
  else
    echo "[seed] Creating group: ${group_name}"
    samba-tool group add "${group_name}" --groupou="${group_ou}" || echo "[seed] Unable to create group ${group_name}"
  fi
}

ensure_user() {
  local username="$1"
  local password="$2"
  shift 2
  if samba-tool user show "${username}" >/dev/null 2>&1; then
    echo "[seed] User exists: ${username}"
  else
    echo "[seed] Creating user: ${username}"
    samba-tool user create "${username}" "${password}" --use-username-as-cn "$@" || echo "[seed] Unable to create user ${username}"
  fi
}

ensure_group_membership() {
  local group="$1"
  shift
  for member in "$@"; do
    if samba-tool group listmembers "${group}" | grep -Fqx "${member}"; then
      echo "[seed] ${member} already in ${group}"
    else
      echo "[seed] Adding ${member} to ${group}"
      samba-tool group addmembers "${group}" "${member}" || echo "[seed] Unable to add ${member} to ${group}"
    fi
  done
}

ensure_ou "${USERS_OU}"
ensure_ou "${GROUPS_OU}"
ensure_ou "${WORKSTATIONS_OU}"

ensure_group "Helpdesk" "OU=Groups"
ensure_group "Workstations" "OU=Groups"
ensure_group "ITAdmins" "OU=Groups"

ensure_user "alice.johnson" "Welcome123!" \
  --userou="OU=Users" \
  --given-name="Alice" \
  --surname="Johnson" \
  --mail-address="alice.johnson@example.local"

ensure_user "bob.smith" "Welcome123!" \
  --userou="OU=Users" \
  --given-name="Bob" \
  --surname="Smith" \
  --mail-address="bob.smith@example.local"

ensure_group_membership "Helpdesk" "alice.johnson"
ensure_group_membership "ITAdmins" "bob.smith"

echo "[seed] Directory provisioning complete."
