#!/bin/bash
# EC2 user-data: first-boot server preparation (runs as root).
set -euxo pipefail

# Docker Engine + Compose v2 from Docker's official repo (the Ubuntu archive
# version can lag behind the `!override` compose-spec support we rely on).
apt-get update
apt-get install -y ca-certificates curl git rsync
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
  https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
  > /etc/apt/sources.list.d/docker.list
apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

usermod -aG docker ubuntu

# App directory the deploys target.
install -d -o ubuntu -g ubuntu /opt/tracking

# Marker for the provisioning script to know first-boot setup finished.
touch /var/lib/cloud/instance/user-data-done
