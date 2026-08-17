#!/usr/bin/env bash
# Tear down everything provision.sh created (instance, EIP, SG, key pair).
# DESTROYS ALL DATA on the instance's disk. Snapshot first if you want the
# DB state back later:
#   aws ec2 create-snapshot --volume-id <vol> --profile personal --region sa-east-1
set -euo pipefail

PROFILE="${AWS_PROFILE_NAME:-personal}"
REGION="${AWS_REGION:-sa-east-1}"
NAME="tracking-demo"

awscli() { command aws --profile "$PROFILE" --region "$REGION" "$@"; }

IDS=$(awscli ec2 describe-instances \
  --filters "Name=tag:Project,Values=$NAME" "Name=instance-state-name,Values=pending,running,stopping,stopped" \
  --query 'Reservations[].Instances[].InstanceId' --output text)
if [ -n "$IDS" ]; then
  echo "→ Terminating: $IDS"
  awscli ec2 terminate-instances --instance-ids $IDS >/dev/null
  awscli ec2 wait instance-terminated --instance-ids $IDS
fi

for alloc in $(awscli ec2 describe-addresses --filters "Name=tag:Project,Values=$NAME" \
    --query 'Addresses[].AllocationId' --output text); do
  echo "→ Releasing Elastic IP $alloc"
  awscli ec2 release-address --allocation-id "$alloc"
done

SG=$(awscli ec2 describe-security-groups --filters "Name=group-name,Values=${NAME}-sg" \
  --query 'SecurityGroups[0].GroupId' --output text 2>/dev/null || true)
if [ -n "$SG" ] && [ "$SG" != "None" ]; then
  echo "→ Deleting security group $SG"
  awscli ec2 delete-security-group --group-id "$SG"
fi

if awscli ec2 describe-key-pairs --key-names "${NAME}-key" >/dev/null 2>&1; then
  echo "→ Deleting key pair ${NAME}-key"
  awscli ec2 delete-key-pair --key-name "${NAME}-key"
  rm -f "$HOME/.ssh/${NAME}-key.pem"
fi

echo "✔ Torn down. Verify \$0 baseline in Cost Explorer tomorrow."
