# Christhood CMMS — Google Cloud Run Deployment Guide

## Architecture

```
GitHub (main branch)
        │
        ▼
GitHub Actions (build-and-deploy job)
        │
        ▼
Google Artifact Registry
us-central1-docker.pkg.dev/PROJECT_ID/christhood-repo/app
        │
        ▼
Google Cloud Run  (christhood-cmms)
https://christhood-cmms-HASH-uc.a.run.app
        │
        ▼
Custom Domain — cmmschristhood.org
```

---

## Prerequisites

| Tool | Install |
|---|---|
| [gcloud CLI](https://cloud.google.com/sdk/docs/install) | `gcloud version` to verify |
| Docker Desktop | `docker --version` to verify |
| Google Cloud project | Created at [console.cloud.google.com](https://console.cloud.google.com) |

---

## 1 — Enable GCP APIs (one time)

```bash
export PROJECT_ID=your-gcp-project-id

gcloud config set project $PROJECT_ID

gcloud services enable \
  run.googleapis.com \
  artifactregistry.googleapis.com \
  cloudbuild.googleapis.com \
  secretmanager.googleapis.com \
  iam.googleapis.com
```

---

## 2 — Create Artifact Registry repository (one time)

```bash
gcloud artifacts repositories create christhood-repo \
  --repository-format=docker \
  --location=us-central1 \
  --description="Christhood CMMS Docker images"
```

---

## 3 — Set up a deployment service account (one time)

```bash
# Create the service account
gcloud iam service-accounts create deploy-sa \
  --display-name="Christhood CMMS Deploy SA"

SA="deploy-sa@${PROJECT_ID}.iam.gserviceaccount.com"

# Grant only the permissions required for deployment
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:$SA" \
  --role="roles/run.admin"

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:$SA" \
  --role="roles/artifactregistry.writer"

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:$SA" \
  --role="roles/secretmanager.secretAccessor"

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:$SA" \
  --role="roles/iam.serviceAccountUser"
```

---

## 4 — Store secrets in Google Secret Manager (one time)

All sensitive environment variables must be stored in Secret Manager before
deploying. Replace each `VALUE` with the real value from your `.env.local`.

```bash
# Helper function — create a secret from a value
store() {
  echo -n "$2" | gcloud secrets create "$1" \
    --replication-policy=automatic \
    --data-file=-
}

store DATABASE_URL              "postgresql://..."
store DIRECT_URL                "postgresql://..."
store NEXTAUTH_SECRET           "your-nextauth-secret"
store NEXTAUTH_URL              "https://cmmschristhood.org"
store NEXT_PUBLIC_APP_URL       "https://cmmschristhood.org"
store GOOGLE_CLIENT_ID          "your-google-client-id"
store GOOGLE_CLIENT_SECRET      "your-google-client-secret"
store CLOUDFLARE_R2_ACCOUNT_ID  "your-r2-account-id"
store CLOUDFLARE_R2_ACCESS_KEY_ID  "your-r2-access-key-id"
store CLOUDFLARE_R2_SECRET_ACCESS_KEY "your-r2-secret-key"
store CLOUDFLARE_R2_BUCKET_NAME "christhood-storage"
store RESEND_API_KEY            "re_..."
store FROM_EMAIL                "noreply@christhood.org"
store VAPID_PUBLIC_KEY          "your-vapid-public-key"
store VAPID_PRIVATE_KEY         "your-vapid-private-key"
store VAPID_SUBJECT             "mailto:admin@christhood.org"
store CRON_SECRET               "your-cron-secret"
store GEMINI_API_KEY            "your-gemini-api-key"
```

> **Tip:** To update the secrets to your production domain:
> ```bash
> echo -n "https://cmmschristhood.org" | \
>   gcloud secrets versions add NEXTAUTH_URL --data-file=-
> echo -n "https://cmmschristhood.org" | \
>   gcloud secrets versions add NEXT_PUBLIC_APP_URL --data-file=-
> ```

---

## 5 — Build & push the Docker image locally

```bash
export PROJECT_ID=your-gcp-project-id
export REGION=us-central1
export IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/christhood-repo/app"

# Authenticate Docker with Artifact Registry
gcloud auth configure-docker ${REGION}-docker.pkg.dev

# Build the image
docker build -t "${IMAGE}:latest" .

# Test it locally (optional — needs a local .env file)
docker run --rm -p 3000:3000 --env-file .env.local "${IMAGE}:latest"

# Push to Artifact Registry
docker push "${IMAGE}:latest"
```

---

## 6 — Deploy to Cloud Run (manual / first deploy)

```bash
export PROJECT_ID=your-gcp-project-id
export REGION=us-central1
export IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/christhood-repo/app:latest"

gcloud run deploy christhood-cmms \
  --image="$IMAGE" \
  --region="$REGION" \
  --platform=managed \
  --allow-unauthenticated \
  --port=3000 \
  --memory=1Gi \
  --cpu=1 \
  --cpu-throttling \
  --min-instances=1 \
  --max-instances=10 \
  --concurrency=80 \
  --timeout=300 \
  --startup-cpu-boost \
  --set-env-vars="NODE_ENV=production,NEXT_TELEMETRY_DISABLED=1,FFMPEG_PATH=/usr/bin/ffmpeg" \
  --update-secrets="\
DATABASE_URL=DATABASE_URL:latest,\
DIRECT_URL=DIRECT_URL:latest,\
NEXTAUTH_SECRET=NEXTAUTH_SECRET:latest,\
NEXTAUTH_URL=NEXTAUTH_URL:latest,\
NEXT_PUBLIC_APP_URL=NEXT_PUBLIC_APP_URL:latest,\
GOOGLE_CLIENT_ID=GOOGLE_CLIENT_ID:latest,\
GOOGLE_CLIENT_SECRET=GOOGLE_CLIENT_SECRET:latest,\
CLOUDFLARE_R2_ACCOUNT_ID=CLOUDFLARE_R2_ACCOUNT_ID:latest,\
CLOUDFLARE_R2_ACCESS_KEY_ID=CLOUDFLARE_R2_ACCESS_KEY_ID:latest,\
CLOUDFLARE_R2_SECRET_ACCESS_KEY=CLOUDFLARE_R2_SECRET_ACCESS_KEY:latest,\
CLOUDFLARE_R2_BUCKET_NAME=CLOUDFLARE_R2_BUCKET_NAME:latest,\
RESEND_API_KEY=RESEND_API_KEY:latest,\
FROM_EMAIL=FROM_EMAIL:latest,\
VAPID_PUBLIC_KEY=VAPID_PUBLIC_KEY:latest,\
VAPID_PRIVATE_KEY=VAPID_PRIVATE_KEY:latest,\
VAPID_SUBJECT=VAPID_SUBJECT:latest,\
CRON_SECRET=CRON_SECRET:latest,\
GEMINI_API_KEY=GEMINI_API_KEY:latest"
```

After the first deploy, Cloud Run prints your public URL:
```
Service URL: https://christhood-cmms-abc123-uc.a.run.app
```

Update `NEXTAUTH_URL` and `NEXT_PUBLIC_APP_URL` in Secret Manager to this URL
(see §4 tip above), then redeploy.

---

## 7 — Set up GitHub Actions CI/CD (automated deploys)

The workflow file is already created at `.github/workflows/deploy-cloud-run.yml`.
It triggers automatically on every push to `main`.

### 7a — Create a Workload Identity Pool (keyless auth)

```bash
PROJECT_NUMBER=$(gcloud projects describe $PROJECT_ID --format='value(projectNumber)')
GITHUB_REPO="Officialkid/christhood-storage-system"  # owner/repo

# Create pool
gcloud iam workload-identity-pools create "github-pool" \
  --project="$PROJECT_ID" \
  --location="global" \
  --display-name="GitHub Actions Pool"

# Create OIDC provider inside the pool
gcloud iam workload-identity-pools providers create-oidc "github-provider" \
  --project="$PROJECT_ID" \
  --location="global" \
  --workload-identity-pool="github-pool" \
  --display-name="GitHub Provider" \
  --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.actor=assertion.actor,attribute.ref=assertion.ref" \
  --issuer-uri="https://token.actions.githubusercontent.com"

# Allow GitHub Actions (from your specific repo) to impersonate the deploy SA
SA="deploy-sa@${PROJECT_ID}.iam.gserviceaccount.com"

gcloud iam service-accounts add-iam-policy-binding "$SA" \
  --project="$PROJECT_ID" \
  --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/github-pool/attribute.repository/${GITHUB_REPO}"

# Print the WIF provider resource name (needed for GitHub Secrets)
gcloud iam workload-identity-pools providers describe github-provider \
  --project="$PROJECT_ID" \
  --location="global" \
  --workload-identity-pool="github-pool" \
  --format="value(name)"
```

### 7b — Add GitHub repository secrets

Go to your GitHub repository → **Settings → Secrets and variables → Actions**
and add these three secrets:

| Secret name | Value |
|---|---|
| `GCP_PROJECT_ID` | Your GCP project ID (e.g. `christhood-prod`) |
| `GCP_SERVICE_ACCOUNT` | `deploy-sa@PROJECT_ID.iam.gserviceaccount.com` |
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | Output of the `gcloud iam ... providers describe` command above |

### 7c — Trigger a deploy

Push any commit to `main`:
```bash
git add .
git commit -m "ci: trigger Cloud Run deploy"
git push origin main
```

Or click **Actions → Build & Deploy to Cloud Run → Run workflow** in GitHub.

---

## 8 — Map a custom domain (optional)

```bash
# Verify domain ownership first in Google Search Console, then:
gcloud beta run domain-mappings create \
  --service=christhood-cmms \
  --domain=cmmschristhood.org \
  --region=us-central1
```

Cloud Run will issue a free TLS certificate automatically.
Add the DNS records shown in the output to your domain registrar.

---

## 9 — Update Google OAuth redirect URIs

After deployment, add the production URL to your Google OAuth 2.0 client:

1. Go to [Google Cloud Console → APIs & Services → Credentials](https://console.cloud.google.com/apis/credentials)
2. Edit your OAuth 2.0 Client ID
3. Add to **Authorised JavaScript origins**: `https://cmmschristhood.org`
4. Add to **Authorised redirect URIs**: `https://cmmschristhood.org/api/auth/callback/google`

---

## 10 — Health check

Cloud Run automatically calls `GET /` on your container to verify startup.
The app exposes a dedicated health endpoint:

```
GET /api/health
```

To configure an explicit startup probe in Cloud Run:
```bash
gcloud run services update christhood-cmms \
  --region=us-central1 \
  --startup-probe-path=/api/health \
  --startup-probe-initial-delay=5 \
  --startup-probe-timeout=10 \
  --startup-probe-failure-threshold=10
```

---

## 11 — View logs

```bash
# Tail live logs from Cloud Run
gcloud logging read \
  "resource.type=cloud_run_revision AND resource.labels.service_name=christhood-cmms" \
  --format="value(textPayload)" \
  --freshness=1h \
  --order=asc

# Or stream via gcloud beta
gcloud beta run services logs tail christhood-cmms --region=us-central1
```

Logs are also visible in:
[Cloud Console → Cloud Run → christhood-cmms → Logs](https://console.cloud.google.com/run)

---

## 12 — Cost optimisation tips

| Setting | Value | Reason |
|---|---|---|
| `--min-instances=0` | 0 | Scale to zero when idle (free tier) |
| `--max-instances=10` | 10 | Cap runaway scaling |
| `--cpu-throttling` | on | CPU only allocated while handling requests |
| `--memory=1Gi` | 1 GiB | Enough for Next.js + sharp + ffmpeg |
| `--concurrency=80` | 80 | Multiple requests per instance before scaling |
| `--startup-cpu-boost` | on | Extra CPU on cold start → faster response |

> **Free tier:** Cloud Run grants 2 million requests/month and 360,000 GB-seconds
> of memory free. A lightly used church system will cost **$0/month** within
> the free tier.

---

## Quick Reference

```bash
# Describe the running service
gcloud run services describe christhood-cmms --region=us-central1

# List deployed revisions
gcloud run revisions list --service=christhood-cmms --region=us-central1

# Roll back to the previous revision
gcloud run services update-traffic christhood-cmms \
  --region=us-central1 \
  --to-revisions=PREVIOUS_REVISION=100

# Delete the service (destructive!)
gcloud run services delete christhood-cmms --region=us-central1
```
