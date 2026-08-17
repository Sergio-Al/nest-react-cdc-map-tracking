#!/usr/bin/env bash
# Provision the single-host demo environment on AWS.
#
#   SSH_CIDR=<your-ip>/32 ./deploy/aws/provision.sh
#
# Creates (all tagged Project=tracking-demo): key pair, security group,
# t3.xlarge Ubuntu 24.04 instance with an 80GB gp3 root disk, Elastic IP.
# Idempotent-ish: refuses to run if an instance tagged tracking-demo is
# already running. Tear everything down with teardown.sh.
set -euo pipefail

PROFILE="${AWS_PROFILE_NAME:-personal}"
REGION="${AWS_REGION:-sa-east-1}"
NAME="tracking-demo"
INSTANCE_TYPE="${INSTANCE_TYPE:-t3.xlarge}"
DISK_GB="${DISK_GB:-80}"
SSH_CIDR="${SSH_CIDR:?Set SSH_CIDR to your public IP, e.g. SSH_CIDR=1.2.3.4/32}"
KEY_FILE="$HOME/.ssh/${NAME}-key.pem"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

awscli() { command aws --profile "$PROFILE" --region "$REGION" "$@"; }

existing=$(awscli ec2 describe-instances \
  --filters "Name=tag:Project,Values=$NAME" "Name=instance-state-name,Values=pending,running,stopping,stopped" \
  --query 'Reservations[].Instances[].InstanceId' --output text)
if [ -n "$existing" ]; then
  echo "✖ Instance(s) already provisioned: $existing — run teardown.sh first." >&2
  exit 1
fi

echo "→ Resolving Ubuntu 24.04 AMI…"
AMI=$(awscli ssm get-parameters \
  --names /aws/service/canonical/ubuntu/server/24.04/stable/current/amd64/hvm/ebs-gp3/ami-id \
  --query 'Parameters[0].Value' --output text)
echo "  AMI: $AMI"

if ! awscli ec2 describe-key-pairs --key-names "${NAME}-key" >/dev/null 2>&1; then
  echo "→ Creating key pair ${NAME}-key → $KEY_FILE"
  awscli ec2 create-key-pair --key-name "${NAME}-key" \
    --query 'KeyMaterial' --output text > "$KEY_FILE"
  chmod 600 "$KEY_FILE"
else
  echo "→ Key pair ${NAME}-key exists (expecting $KEY_FILE locally)"
fi

VPC=$(awscli ec2 describe-vpcs --filters Name=isDefault,Values=true --query 'Vpcs[0].VpcId' --output text)

SG=$(awscli ec2 describe-security-groups \
  --filters "Name=group-name,Values=${NAME}-sg" "Name=vpc-id,Values=$VPC" \
  --query 'SecurityGroups[0].GroupId' --output text 2>/dev/null || true)
if [ -z "$SG" ] || [ "$SG" = "None" ]; then
  echo "→ Creating security group ${NAME}-sg"
  SG=$(awscli ec2 create-security-group --group-name "${NAME}-sg" \
    --description "tracking-demo single host" --vpc-id "$VPC" \
    --tag-specifications "ResourceType=security-group,Tags=[{Key=Project,Value=$NAME}]" \
    --query 'GroupId' --output text)
  # SSH + Traccar web UI: admin IP only. Frontend, API/WS, OsmAnd ingest: public.
  awscli ec2 authorize-security-group-ingress --group-id "$SG" --protocol tcp --port 22   --cidr "$SSH_CIDR"
  awscli ec2 authorize-security-group-ingress --group-id "$SG" --protocol tcp --port 8082 --cidr "$SSH_CIDR"
  awscli ec2 authorize-security-group-ingress --group-id "$SG" --protocol tcp --port 80   --cidr 0.0.0.0/0
  awscli ec2 authorize-security-group-ingress --group-id "$SG" --protocol tcp --port 3000 --cidr 0.0.0.0/0
  awscli ec2 authorize-security-group-ingress --group-id "$SG" --protocol tcp --port 5055 --cidr 0.0.0.0/0
fi
echo "  SG: $SG"

echo "→ Launching $INSTANCE_TYPE (${DISK_GB}GB gp3)…"
INSTANCE=$(awscli ec2 run-instances \
  --image-id "$AMI" --instance-type "$INSTANCE_TYPE" --key-name "${NAME}-key" \
  --security-group-ids "$SG" \
  --block-device-mappings "[{\"DeviceName\":\"/dev/sda1\",\"Ebs\":{\"VolumeSize\":$DISK_GB,\"VolumeType\":\"gp3\",\"DeleteOnTermination\":true}}]" \
  --user-data "file://$SCRIPT_DIR/user-data.sh" \
  --tag-specifications "ResourceType=instance,Tags=[{Key=Project,Value=$NAME},{Key=Name,Value=$NAME}]" \
  --query 'Instances[0].InstanceId' --output text)
echo "  Instance: $INSTANCE"

awscli ec2 wait instance-running --instance-ids "$INSTANCE"

ALLOC=$(awscli ec2 describe-addresses --filters "Name=tag:Project,Values=$NAME" \
  --query 'Addresses[0].AllocationId' --output text 2>/dev/null || true)
if [ -z "$ALLOC" ] || [ "$ALLOC" = "None" ]; then
  echo "→ Allocating Elastic IP…"
  ALLOC=$(awscli ec2 allocate-address --domain vpc \
    --tag-specifications "ResourceType=elastic-ip,Tags=[{Key=Project,Value=$NAME}]" \
    --query 'AllocationId' --output text)
fi
awscli ec2 associate-address --instance-id "$INSTANCE" --allocation-id "$ALLOC" >/dev/null
EIP=$(awscli ec2 describe-addresses --allocation-ids "$ALLOC" --query 'Addresses[0].PublicIp' --output text)

echo ""
echo "✔ Provisioned."
echo "  Instance : $INSTANCE"
echo "  Public IP: $EIP"
echo "  SSH      : ssh -i $KEY_FILE ubuntu@$EIP"
echo ""
echo "Next: ./deploy/aws/first-deploy.sh $EIP"
