#!/bin/bash
set -euo pipefail

# Blupe Workflow Runner Deployment Script
# - Builds the container once
# - Syncs sensitive keys from root .env into GCP Secret Manager (not plain env)
# - Deploys to us-central1 + asia-south1 by default
# Targets team@blupe.space / blupe-voice

echo "===================================================="
echo "🚀 Blupe Workflow Runner Cloud Run Deployer"
echo "===================================================="

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Non-secret config
SUPABASE_URL=""
SITE_URL=""
CLOUD_RUN_CUSTOM_NODE_URL=""

# Sensitive values (loaded from .env, stored in Secret Manager)
SUPABASE_SERVICE_ROLE_KEY=""
SECRETS_MASTER_KEY=""
BLUPE_CUSTOM_NODE_SECRET=""
API_KEY=""
GEMINI_API_KEY=""
OPENAI_API_KEY=""
ANTHROPIC_API_KEY=""
GROQ_API_KEY=""
TAVILY_API_KEY=""
SMTP_HOST=""
SMTP_PORT=""
SMTP_USER=""
SMTP_PASS=""
SMTP_FROM=""
EMAIL_FROM=""
RAZORPAY_KEY_ID=""
RAZORPAY_KEY_SECRET=""

read_env_key() {
    local env_file=$1
    local key=$2
    if [ -f "$env_file" ]; then
        # Take first match; strip CR; do not echo value
        grep -E "^${key}=" "$env_file" 2>/dev/null | head -1 | cut -d= -f2- | tr -d '\r' || true
    fi
}

load_env() {
    local env_file=$1
    if [ ! -f "$env_file" ]; then
        return
    fi
    echo "🔑 Loading keys from $env_file (values not printed)..."
    [ -z "$SUPABASE_URL" ] && SUPABASE_URL=$(read_env_key "$env_file" SUPABASE_URL)
    [ -z "$SUPABASE_URL" ] && SUPABASE_URL=$(read_env_key "$env_file" VITE_SUPABASE_URL)
    [ -z "$SUPABASE_SERVICE_ROLE_KEY" ] && SUPABASE_SERVICE_ROLE_KEY=$(read_env_key "$env_file" SUPABASE_SERVICE_ROLE_KEY)
    [ -z "$SUPABASE_SERVICE_ROLE_KEY" ] && SUPABASE_SERVICE_ROLE_KEY=$(read_env_key "$env_file" SUPABASE_SERVICE_KEY)
    [ -z "$SECRETS_MASTER_KEY" ] && SECRETS_MASTER_KEY=$(read_env_key "$env_file" SECRETS_MASTER_KEY)
    [ -z "$SITE_URL" ] && SITE_URL=$(read_env_key "$env_file" SITE_URL)
    [ -z "$CLOUD_RUN_CUSTOM_NODE_URL" ] && CLOUD_RUN_CUSTOM_NODE_URL=$(read_env_key "$env_file" CLOUD_RUN_CUSTOM_NODE_URL)
    [ -z "$BLUPE_CUSTOM_NODE_SECRET" ] && BLUPE_CUSTOM_NODE_SECRET=$(read_env_key "$env_file" BLUPE_CUSTOM_NODE_SECRET)
    [ -z "$API_KEY" ] && API_KEY=$(read_env_key "$env_file" API_KEY)
    [ -z "$GEMINI_API_KEY" ] && GEMINI_API_KEY=$(read_env_key "$env_file" GEMINI_API_KEY)
    [ -z "$OPENAI_API_KEY" ] && OPENAI_API_KEY=$(read_env_key "$env_file" OPENAI_API_KEY)
    [ -z "$ANTHROPIC_API_KEY" ] && ANTHROPIC_API_KEY=$(read_env_key "$env_file" ANTHROPIC_API_KEY)
    [ -z "$GROQ_API_KEY" ] && GROQ_API_KEY=$(read_env_key "$env_file" GROQ_API_KEY)
    [ -z "$TAVILY_API_KEY" ] && TAVILY_API_KEY=$(read_env_key "$env_file" TAVILY_API_KEY)
    [ -z "$SMTP_HOST" ] && SMTP_HOST=$(read_env_key "$env_file" SMTP_HOST)
    [ -z "$SMTP_PORT" ] && SMTP_PORT=$(read_env_key "$env_file" SMTP_PORT)
    [ -z "$SMTP_USER" ] && SMTP_USER=$(read_env_key "$env_file" SMTP_USER)
    [ -z "$SMTP_PASS" ] && SMTP_PASS=$(read_env_key "$env_file" SMTP_PASS)
    [ -z "$SMTP_FROM" ] && SMTP_FROM=$(read_env_key "$env_file" SMTP_FROM)
    [ -z "$EMAIL_FROM" ] && EMAIL_FROM=$(read_env_key "$env_file" EMAIL_FROM)
    [ -z "$RAZORPAY_KEY_ID" ] && RAZORPAY_KEY_ID=$(read_env_key "$env_file" RAZORPAY_KEY_ID)
    [ -z "$RAZORPAY_KEY_SECRET" ] && RAZORPAY_KEY_SECRET=$(read_env_key "$env_file" RAZORPAY_KEY_SECRET)
}

load_env "$ROOT_DIR/.env"
load_env "$SCRIPT_DIR/.env"

SITE_URL="${SITE_URL:-https://blupe.space}"

if [ -z "$SUPABASE_URL" ] || [ -z "$SUPABASE_SERVICE_ROLE_KEY" ]; then
    echo "❌ Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY/SUPABASE_SERVICE_KEY are required in .env"
    exit 1
fi

if [ -z "$SECRETS_MASTER_KEY" ]; then
    echo "❌ Error: SECRETS_MASTER_KEY is required in .env file."
    exit 1
fi

if ! command -v gcloud &> /dev/null; then
    echo "❌ Error: Google Cloud SDK (gcloud CLI) is not installed."
    exit 1
fi

ACTIVE_ACCOUNT=$(gcloud config get-value account 2>/dev/null || echo "")
TARGET_ACCOUNT="team@blupe.space"
if [ "$ACTIVE_ACCOUNT" != "$TARGET_ACCOUNT" ]; then
    echo "🔄 Switching Google Cloud account to $TARGET_ACCOUNT..."
    gcloud auth login "$TARGET_ACCOUNT"
fi

PROJECT_ID=$(gcloud config get-value project 2>/dev/null || echo "")
if [ -z "$PROJECT_ID" ] || [ "$PROJECT_ID" = "(unset)" ]; then
    echo "❌ Error: No active GCP project. Run: gcloud config set project blupe-voice"
    exit 1
fi
echo "🎯 Active GCP Project: $PROJECT_ID"

if [ -n "${REGION:-}" ] && [ -z "${REGIONS:-}" ]; then
  REGIONS="$REGION"
else
  REGIONS="${REGIONS:-us-central1 asia-south1}"
fi

IMAGE_NAME="gcr.io/$PROJECT_ID/blupe-workflow-runner:latest"
SERVICE_NAME="blupe-workflow-runner"

# ---------------------------------------------------------------------------
# Secret Manager: store sensitive keys (never baked into the image)
# ---------------------------------------------------------------------------
echo "🔐 Ensuring Secret Manager API is enabled..."
gcloud services enable secretmanager.googleapis.com --project="$PROJECT_ID" --quiet

PROJECT_NUMBER=$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')
# Default Cloud Run runtime service account
RUNTIME_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"

# Map: SECRET_MANAGER_NAME=shell_variable_name
# Secret names use a blupe- prefix to avoid collisions with other services.
upsert_secret() {
    local secret_id=$1
    local value=$2
    if [ -z "$value" ]; then
        echo "   ↷ skip $secret_id (empty in .env)"
        return 1
    fi

    if gcloud secrets describe "$secret_id" --project="$PROJECT_ID" &>/dev/null; then
        # Only add a new version if content changed (best-effort: always add for simplicity/reliability)
        printf '%s' "$value" | gcloud secrets versions add "$secret_id" \
            --project="$PROJECT_ID" \
            --data-file=- \
            --quiet >/dev/null
        echo "   ✓ updated secret $secret_id"
    else
        printf '%s' "$value" | gcloud secrets create "$secret_id" \
            --project="$PROJECT_ID" \
            --replication-policy=automatic \
            --data-file=- \
            --quiet >/dev/null
        echo "   ✓ created secret $secret_id"
    fi

    # Grant Cloud Run runtime SA access (idempotent)
    gcloud secrets add-iam-policy-binding "$secret_id" \
        --project="$PROJECT_ID" \
        --member="serviceAccount:${RUNTIME_SA}" \
        --role="roles/secretmanager.secretAccessor" \
        --quiet >/dev/null || true
    return 0
}

echo "🔐 Syncing .env secrets → Secret Manager (values not printed)..."
# shellcheck disable=SC2034
declare -a SECRET_BINDINGS=()

add_binding_if_present() {
    local env_name=$1
    local secret_id=$2
    local value=$3
    if upsert_secret "$secret_id" "$value"; then
        SECRET_BINDINGS+=("${env_name}=${secret_id}:latest")
    fi
}

# Core runtime secrets
add_binding_if_present "SUPABASE_SERVICE_ROLE_KEY" "blupe-supabase-service-role-key" "$SUPABASE_SERVICE_ROLE_KEY"
add_binding_if_present "SECRETS_MASTER_KEY" "blupe-secrets-master-key" "$SECRETS_MASTER_KEY"
add_binding_if_present "BLUPE_CUSTOM_NODE_SECRET" "blupe-custom-node-secret" "$BLUPE_CUSTOM_NODE_SECRET"

# LLM / search / email platform keys (used when user has no BYOK secret)
add_binding_if_present "API_KEY" "blupe-api-key" "$API_KEY"
add_binding_if_present "GEMINI_API_KEY" "blupe-gemini-api-key" "$GEMINI_API_KEY"
add_binding_if_present "OPENAI_API_KEY" "blupe-openai-api-key" "$OPENAI_API_KEY"
add_binding_if_present "ANTHROPIC_API_KEY" "blupe-anthropic-api-key" "$ANTHROPIC_API_KEY"
add_binding_if_present "GROQ_API_KEY" "blupe-groq-api-key" "$GROQ_API_KEY"
add_binding_if_present "TAVILY_API_KEY" "blupe-tavily-api-key" "$TAVILY_API_KEY"
add_binding_if_present "SMTP_HOST" "blupe-smtp-host" "$SMTP_HOST"
add_binding_if_present "SMTP_PORT" "blupe-smtp-port" "$SMTP_PORT"
add_binding_if_present "SMTP_USER" "blupe-smtp-user" "$SMTP_USER"
add_binding_if_present "SMTP_PASS" "blupe-smtp-pass" "$SMTP_PASS"
add_binding_if_present "SMTP_FROM" "blupe-smtp-from" "$SMTP_FROM"
add_binding_if_present "EMAIL_FROM" "blupe-email-from" "$EMAIL_FROM"
add_binding_if_present "RAZORPAY_KEY_ID" "blupe-razorpay-key-id" "$RAZORPAY_KEY_ID"
add_binding_if_present "RAZORPAY_KEY_SECRET" "blupe-razorpay-key-secret" "$RAZORPAY_KEY_SECRET"

if [ ${#SECRET_BINDINGS[@]} -eq 0 ]; then
    echo "❌ Error: no secrets were created. Check .env"
    exit 1
fi

# Join bindings for gcloud
SECRETS_CSV=$(IFS=,; echo "${SECRET_BINDINGS[*]}")

# Non-secret plain env (safe to show in console)
PLAIN_ENV="SUPABASE_URL=${SUPABASE_URL},SITE_URL=${SITE_URL}"
if [ -n "$CLOUD_RUN_CUSTOM_NODE_URL" ]; then
    PLAIN_ENV="${PLAIN_ENV},CLOUD_RUN_CUSTOM_NODE_URL=${CLOUD_RUN_CUSTOM_NODE_URL}"
fi

echo "📦 Submitting Docker image build via Cloud Build..."
cd "$SCRIPT_DIR"
gcloud builds submit --tag "$IMAGE_NAME" --quiet

for DEPLOY_REGION in $REGIONS; do
  echo "🚀 Deploying workflow-runner to Cloud Run ($DEPLOY_REGION)..."
  gcloud run deploy "$SERVICE_NAME" \
    --image "$IMAGE_NAME" \
    --platform managed \
    --region "$DEPLOY_REGION" \
    --allow-unauthenticated \
    --concurrency 80 \
    --min-instances 1 \
    --max-instances 4 \
    --timeout 900s \
    --service-account="$RUNTIME_SA" \
    --set-env-vars="$PLAIN_ENV" \
    --set-secrets="$SECRETS_CSV" \
    --quiet

  # Remove any legacy plaintext secrets that may still be set as env vars
  # (from older deploys). --set-env-vars replaces the env var map for listed
  # keys; clear known sensitive names if present as plain env.
  gcloud run services update "$SERVICE_NAME" \
    --region "$DEPLOY_REGION" \
    --remove-env-vars="SUPABASE_SERVICE_ROLE_KEY,SECRETS_MASTER_KEY,BLUPE_CUSTOM_NODE_SECRET,API_KEY,GEMINI_API_KEY,OPENAI_API_KEY,ANTHROPIC_API_KEY,GROQ_API_KEY,TAVILY_API_KEY,SMTP_HOST,SMTP_PORT,SMTP_USER,SMTP_PASS,SMTP_FROM,EMAIL_FROM,RAZORPAY_KEY_ID,RAZORPAY_KEY_SECRET" \
    --quiet 2>/dev/null || true

  URL=$(gcloud run services describe "$SERVICE_NAME" --platform managed --region "$DEPLOY_REGION" --format 'value(status.url)')
  REV=$(gcloud run services describe "$SERVICE_NAME" --platform managed --region "$DEPLOY_REGION" --format 'value(status.latestReadyRevisionName)')
  echo "   ✅ $DEPLOY_REGION → $URL ($REV)"
done

echo "===================================================="
echo "✅ Deployment Successful!"
echo "===================================================="
echo "Regions: $REGIONS"
echo "Secrets mounted from Secret Manager: ${#SECRET_BINDINGS[@]}"
echo "Plain env only: SUPABASE_URL, SITE_URL, CLOUD_RUN_CUSTOM_NODE_URL"
echo "👉 Keep existing runner URLs in VITE_/CLOUD_RUN_WORKFLOW_RUNNER_URL"
echo "===================================================="
