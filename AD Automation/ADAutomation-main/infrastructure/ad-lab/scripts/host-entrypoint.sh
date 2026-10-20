#!/usr/bin/env bash
set -euo pipefail

JOIN_DOMAIN="${JOIN_DOMAIN:-true}"
DOMAIN_REALM="${DOMAIN_REALM:-EXAMPLE.LOCAL}"
DOMAIN_REALM_UPPER="${DOMAIN_REALM^^}"
DOMAIN_NETBIOS="${DOMAIN_NETBIOS:-EXAMPLE}"
DOMAIN_ADMIN_USER="${DOMAIN_ADMIN_USER:-Administrator}"
DOMAIN_ADMIN_PASSWORD="${DOMAIN_ADMIN_PASSWORD:-ChangeMe123!}"
DC_HOST="${DC_HOST:-ad-controller}"
HOST_SHORTNAME="${HOSTNAME_OVERRIDE:-$(cat /etc/hostname)}"

realm_to_dn() {
  local realm_upper="${DOMAIN_REALM_UPPER}"
  local IFS='.'
  local parts=(${realm_upper})
  local dn=""
  for part in "${parts[@]}"; do
    if [ -z "${dn}" ]; then
      dn="DC=${part}"
    else
      dn="${dn},DC=${part}"
    fi
  done
  echo "${dn}"
}

BASE_DN="$(realm_to_dn)"

echo "[host-entrypoint] Starting host ${HOST_SHORTNAME} (join=${JOIN_DOMAIN})"

echo "${HOST_SHORTNAME}" > /etc/hostname || true
if ! hostname "${HOST_SHORTNAME}" 2>/dev/null; then
  echo "[host-entrypoint] Warning: unable to change hostname (continuing)."
fi

# Ensure /etc/hosts resolves the domain controller via Docker DNS name
if ! grep -q "${HOST_SHORTNAME}" /etc/hosts; then
  echo "127.0.1.1 ${HOST_SHORTNAME}" >> /etc/hosts
fi

DC_IP="$(getent hosts "${DC_HOST}" | awk '{print $1}' | head -n1 || true)"
if [ -n "${DC_IP}" ] && ! grep -q "${DC_HOST}.${DOMAIN_REALM,,}" /etc/hosts; then
  echo "${DC_IP} ${DC_HOST}.${DOMAIN_REALM,,} ${DC_HOST}" >> /etc/hosts
fi

if [ -n "${DC_IP}" ]; then
  cat >/etc/resolv.conf <<EOF
nameserver ${DC_IP}
search ${DOMAIN_REALM,,}
options timeout:1 attempts:3
EOF
fi

cat >/etc/krb5.conf <<EOF
[libdefaults]
        default_realm = ${DOMAIN_REALM_UPPER}
        dns_lookup_realm = false
        dns_lookup_kdc = true

[realms]
        ${DOMAIN_REALM_UPPER} = {
                kdc = ${DC_HOST}.${DOMAIN_REALM,,}
        }

[domain_realm]
        .${DOMAIN_REALM,,} = ${DOMAIN_REALM_UPPER}
        ${DOMAIN_REALM,,} = ${DOMAIN_REALM_UPPER}
EOF

cat >/etc/samba/smb.conf <<EOF
[global]
   workgroup = ${DOMAIN_NETBIOS}
   security = ADS
   realm = ${DOMAIN_REALM_UPPER}
   encrypt passwords = yes
   kerberos method = secrets and keytab
   winbind use default domain = yes
   template shell = /bin/bash
   template homedir = /home/%U
   client min protocol = SMB2
   client max protocol = SMB3
   dedicated keytab file = /etc/krb5.keytab
EOF

# Wait for domain controller availability
if [[ "${JOIN_DOMAIN,,}" == "true" ]]; then
  echo "[host-entrypoint] Waiting for domain controller ${DC_HOST} to respond on LDAP (389)"
  for attempt in {1..30}; do
    if nc -z "${DC_HOST}" 389 >/dev/null 2>&1; then
      echo "[host-entrypoint] Domain controller reachable."
      break
    fi
    echo "[host-entrypoint] Attempt ${attempt}/30: still waiting..."
    sleep 2
  done
fi

join_domain_if_needed() {
  if ! net ads testjoin >/dev/null 2>&1; then
    echo "[host-entrypoint] Joining domain ${DOMAIN_REALM_UPPER}"
    local dc_fqdn="${DC_HOST}.${DOMAIN_REALM,,}"
    local attempts=10
    local attempt=1
    while [ "${attempt}" -le "${attempts}" ]; do
      echo "[host-entrypoint] Domain join attempt ${attempt}/${attempts}"
      if net ads join -S "${dc_fqdn}" \
        --realm="${DOMAIN_REALM_UPPER}" \
        -U "${DOMAIN_ADMIN_USER}%${DOMAIN_ADMIN_PASSWORD}" \
        createcomputer="OU=Workstations,${BASE_DN}"; then
        echo "[host-entrypoint] Domain join succeeded."
        break
      fi

      echo "[host-entrypoint] Domain join failed (attempt ${attempt}); waiting before retry."
      attempt=$((attempt + 1))
      sleep 10
    done

    if ! net ads testjoin >/dev/null 2>&1; then
      echo "[host-entrypoint] WARNING: Domain join did not succeed after ${attempts} attempts."
    fi
  else
    echo "[host-entrypoint] Already joined to domain."
  fi
  return 0
}

if [[ "${JOIN_DOMAIN,,}" == "true" ]]; then
  join_domain_if_needed
fi

# Start winbindd in the background if not running
if ! pgrep -x winbindd >/dev/null 2>&1; then
  echo "[host-entrypoint] Starting winbindd"
  /usr/sbin/winbindd || echo "[host-entrypoint] winbindd exited unexpectedly (continuing)"
fi

mkdir -p /var/run/sshd
echo "[host-entrypoint] Starting sshd"
exec /usr/sbin/sshd -D -e
