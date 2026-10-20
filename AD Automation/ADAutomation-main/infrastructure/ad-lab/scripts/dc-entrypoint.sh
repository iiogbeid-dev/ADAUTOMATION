#!/usr/bin/env bash
set -euo pipefail

DOMAIN="${SAMBA_DOMAIN:-EXAMPLE}"
REALM="${SAMBA_REALM:-EXAMPLE.LOCAL}"
ADMIN_PASSWORD="${SAMBA_ADMIN_PASSWORD:-ChangeMe123!}"
HOST_FQDN="${SAMBA_HOSTNAME:-ad-controller}.${REALM,,}"
HOST_SHORT="${SAMBA_HOSTNAME:-ad-controller}"
MARKER_FILE="/var/lib/samba/.provisioned"

echo "[dc-entrypoint] Starting Active Directory controller for ${REALM}"
echo "${HOST_SHORT}" > /etc/hostname || true
if ! hostname "${HOST_SHORT}" 2>/dev/null; then
  echo "[dc-entrypoint] Warning: unable to change hostname (continuing)."
fi

# Ensure /etc/hosts has an entry for our own hostname
if ! grep -q "${HOST_SHORT}" /etc/hosts; then
  echo "127.0.1.1 ${HOST_SHORT} ${HOST_FQDN}" >> /etc/hosts
fi

if [ ! -f "${MARKER_FILE}" ]; then
  echo "[dc-entrypoint] Provisioning new Samba AD domain ${REALM}"
  rm -f /etc/samba/smb.conf

  samba-tool domain provision \
    --use-rfc2307 \
    --realm="${REALM}" \
    --domain="${DOMAIN}" \
    --server-role=dc \
    --dns-backend=SAMBA_INTERNAL \
    --function-level=2008_R2 \
    --adminpass="${ADMIN_PASSWORD}" \
    --option="interfaces = lo eth0" \
    --option="bind interfaces only = no" \
    --option="posix:eadb = yes"

  cp /var/lib/samba/private/krb5.conf /etc/krb5.conf

  echo "[dc-entrypoint] Seeding directory with demo data"
  SAMBA_DOMAIN="${DOMAIN}" \
  SAMBA_REALM="${REALM}" \
  /usr/local/bin/seed-directory.sh

  touch "${MARKER_FILE}"
else
  echo "[dc-entrypoint] Existing domain detected, skipping provisioning"
  if [ -f /var/lib/samba/private/krb5.conf ]; then
    cp /var/lib/samba/private/krb5.conf /etc/krb5.conf
  fi
fi

# Ensure local DNS queries resolve against the Samba internal DNS
cat >/etc/resolv.conf <<EOF
nameserver 127.0.0.1
search ${REALM,,}
options timeout:1 attempts:3
EOF

echo "[dc-entrypoint] Launching samba (foreground)"
exec /usr/sbin/samba -i --debug-stdout
