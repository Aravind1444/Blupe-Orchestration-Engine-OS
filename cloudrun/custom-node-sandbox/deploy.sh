#!/bin/bash
set -e

# Blupe Custom Node Sandbox Deployment Script
# Targets GCP Cloud Run deployment for team@blupe.space

echo "===================================================="
echo "🚀 Blupe Custom Node Sandbox Cloud Run Deployer"
echo "===================================================="

# 1. Load environment variables from local .env if present
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

BLUPE_CUSTOM_NODE_SECRET=""
if [ -f "$ROOT_DIR/.env" ]; then
    echo "🔑 Found root .env file. Extracting custom node secret..."
    BLUPE_CUSTOM_NODE_SECRET=$(grep "^BLUPE_CUSTOM_NODE_SECRET=" "$ROOT_DIR/.env" | cut -d'=' -f2-)
fi

if [ -z "$BLUPE_CUSTOM_NODE_SECRET" ] && [ -f "$SCRIPT_DIR/.env" ]; then
    echo "🔑 Found local .env file. Extracting custom node secret..."
    BLUPE_CUSTOM_NODE_SECRET=$(grep "^BLUPE_CUSTOM_NODE_SECRET=" "$SCRIPT_DIR/.env" | cut -d'=' -f2-)
fi

# Ensure secret is populated or generate one
if [ -z "$BLUPE_CUSTOM_NODE_SECRET" ]; then
    echo "⚠️  BLUPE_CUSTOM_NODE_SECRET not found in .env files."
    BLUPE_CUSTOM_NODE_SECRET=$(od -An -N32 -tx1 /dev/urandom | tr -d ' \n')
    echo "🎲 Generated a new secret: $BLUPE_CUSTOM_NODE_SECRET"
    echo "📝 Make sure to append this secret to your root .env file: BLUPE_CUSTOM_NODE_SECRET=$BLUPE_CUSTOM_NODE_SECRET"
fi

# 2. Check gcloud installation
if ! command -v gcloud &> /dev/null; then
    echo "❌ Error: Google Cloud SDK (gcloud CLI) is not installed."
    echo "👉 Please install it from https://cloud.google.com/sdk/docs/install"
    exit 1
fi

# 3. Check active GCP account
ACTIVE_ACCOUNT=$(gcloud config get-value account 2>/dev/null || echo "")
TARGET_ACCOUNT="team@blupe.space"

if [ "$ACTIVE_ACCOUNT" != "$TARGET_ACCOUNT" ]; then
    echo "🔄 Switching Google Cloud account to $TARGET_ACCOUNT..."
    gcloud auth login "$TARGET_ACCOUNT"
fi

# 4. Set GCP Project (prompt or auto-select)
PROJECT_ID=$(gcloud config get-value project 2>/dev/null || echo "")
if [ -z "$PROJECT_ID" ] || [ "$PROJECT_ID" = "(unset)" ]; then
    echo "📂 No active GCP project set. Listing available projects..."
    gcloud projects list
    read -p "📝 Enter the GCP Project ID to deploy to: " PROJECT_ID
    if [ -z "$PROJECT_ID" ]; then
        echo "❌ Error: Project ID cannot be empty."
        exit 1
    fi
    gcloud config set project "$PROJECT_ID"
else
    echo "🎯 Active GCP Project: $PROJECT_ID"
    read -p "🔄 Do you want to use a different project? (y/N): " CHANGE_PROJECT
    if [[ "$CHANGE_PROJECT" =~ ^[Yy]$ ]]; then
        gcloud projects list
        read -p "📝 Enter the new GCP Project ID: " PROJECT_ID
        gcloud config set project "$PROJECT_ID"
    fi
fi

# 5. Build and Deploy using Cloud Build & Cloud Run
IMAGE_NAME="gcr.io/$PROJECT_ID/blupe-custom-node-sandbox:latest"
SERVICE_NAME="blupe-custom-node-sandbox"
REGION="${REGION:-us-central1}"

echo "📦 Submitting Docker image build via Cloud Build..."
cd "$SCRIPT_DIR"
gcloud builds submit --tag "$IMAGE_NAME"

echo "🚀 Deploying service to Cloud Run..."
gcloud run deploy "$SERVICE_NAME" \
  --image "$IMAGE_NAME" \
  --platform managed \
  --region "$REGION" \
  --allow-unauthenticated \
  --concurrency 4 \
  --min-instances 0 \
  --max-instances 4 \
  --timeout 30s \
  --set-env-vars="BLUPE_CUSTOM_NODE_SECRET=${BLUPE_CUSTOM_NODE_SECRET}"

# 6. Final success messaging
echo "===================================================="
echo "✅ Deployment Successful!"
echo "===================================================="
URL=$(gcloud run services describe "$SERVICE_NAME" --platform managed --region "$REGION" --format 'value(status.url)')
echo "🌐 Service URL: $URL"
echo "🔑 Share Secret: $BLUPE_CUSTOM_NODE_SECRET"
echo ""
echo "👉 Now configure these in your platforms:"
echo "1. Add to root .env / Supabase Edge environment:"
echo "   CLOUD_RUN_CUSTOM_NODE_URL=$URL"
echo "   BLUPE_CUSTOM_NODE_SECRET=$BLUPE_CUSTOM_NODE_SECRET"
echo "===================================================="
