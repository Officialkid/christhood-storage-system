# ═══════════════════════════════════════════════════════════════════════════════
# scripts/migrate-to-target-project.ps1
#
# Provision GCP resources and deploy Christhood CMMS to project:
#   project-d46be384-233e-47fb-bb5 (us-central1)
# ═══════════════════════════════════════════════════════════════════════════════

param (
    [string]$ProjectId = "project-d46be384-233e-47fb-bb5",
    [string]$Region = "us-central1",
    [string]$ServiceName = "christhood-cmms",
    [string]$RepoName = "christhood-repo",
    [string]$EnvFile = ".env.local"
)

$ErrorActionPreference = "Stop"

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " Deploying Christhood CMMS to Target Project" -ForegroundColor Cyan
Write-Host " Project: $ProjectId" -ForegroundColor Cyan
Write-Host " Region : $Region" -ForegroundColor Cyan
Write-Host " Service: $ServiceName" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# 1. Configure gcloud
Write-Host "`n==> [1/6] Setting gcloud active project..." -ForegroundColor Yellow
cmd.exe /c "gcloud config set project $ProjectId"

# 2. Enable Required APIs
Write-Host "`n==> [2/6] Enabling Google Cloud APIs..." -ForegroundColor Yellow
cmd.exe /c "gcloud services enable run.googleapis.com artifactregistry.googleapis.com cloudbuild.googleapis.com secretmanager.googleapis.com iam.googleapis.com --project $ProjectId"

# 3. Create Artifact Registry repository if not exists
Write-Host "`n==> [3/6] Ensuring Artifact Registry repository '$RepoName' exists..." -ForegroundColor Yellow
cmd.exe /c "gcloud artifacts repositories describe $RepoName --location=$Region --project=$ProjectId" 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "Creating Artifact Registry repository '$RepoName'..." -ForegroundColor Green
    cmd.exe /c "gcloud artifacts repositories create $RepoName --repository-format=docker --location=$Region --description='Christhood CMMS Docker images' --project=$ProjectId"
} else {
    Write-Host "Repository '$RepoName' already exists." -ForegroundColor Green
}

# 4. Create Deploy Service Account
Write-Host "`n==> [4/6] Ensuring Service Account 'deploy-sa' exists..." -ForegroundColor Yellow
$saEmail = "deploy-sa@$ProjectId.iam.gserviceaccount.com"
cmd.exe /c "gcloud iam service-accounts describe $saEmail --project=$ProjectId" 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "Creating service account '$saEmail'..." -ForegroundColor Green
    cmd.exe /c "gcloud iam service-accounts create deploy-sa --display-name='Christhood CMMS Deploy SA' --project=$ProjectId"
}

Write-Host "Binding IAM roles to $saEmail..." -ForegroundColor Yellow
$roles = @(
    "roles/run.admin",
    "roles/artifactregistry.writer",
    "roles/secretmanager.secretAccessor",
    "roles/iam.serviceAccountUser"
)
foreach ($role in $roles) {
    cmd.exe /c "gcloud projects add-iam-policy-binding $ProjectId --member=serviceAccount:$saEmail --role=$role --condition=None"
}

# 5. Populate Secrets from .env.local into Secret Manager
Write-Host "`n==> [5/6] Syncing secrets to Secret Manager..." -ForegroundColor Yellow
if (Test-Path $EnvFile) {
    $lines = Get-Content $EnvFile
    foreach ($line in $lines) {
        $trimmed = $line.Trim()
        if (-not $trimmed -or $trimmed.StartsWith("#")) { continue }
        $split = $trimmed.Split('=', 2)
        if ($split.Length -eq 2) {
            $key = $split[0].Trim()
            $val = $split[1].Trim().Trim('"').Trim("'")
            
            if ($key -in @(
                "DATABASE_URL", "DIRECT_URL", "NEXTAUTH_SECRET", "NEXTAUTH_URL", 
                "NEXT_PUBLIC_APP_URL", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET",
                "CLOUDFLARE_R2_ACCOUNT_ID", "CLOUDFLARE_R2_ACCESS_KEY_ID", "CLOUDFLARE_R2_SECRET_ACCESS_KEY",
                "CLOUDFLARE_R2_BUCKET_NAME", "RESEND_API_KEY", "FROM_EMAIL",
                "VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "VAPID_SUBJECT",
                "CRON_SECRET", "GEMINI_API_KEY", "GALLERY_R2_ACCOUNT_ID",
                "GALLERY_R2_ACCESS_KEY_ID", "GALLERY_R2_SECRET_ACCESS_KEY", "GALLERY_R2_BUCKET_NAME",
                "GALLERY_R2_PUBLIC_URL", "TOTP_ENCRYPTION_KEY", "GALLERY_BASE_URL"
            )) {
                Write-Host "Setting secret: $key" -ForegroundColor Green
                $tempFile = [System.IO.Path]::GetTempFileName()
                [System.IO.File]::WriteAllText($tempFile, $val)
                try {
                    cmd.exe /c "gcloud secrets describe $key --project=$ProjectId" 2>$null
                    if ($LASTEXITCODE -eq 0) {
                        cmd.exe /c "gcloud secrets versions add $key --data-file=`"$tempFile`" --project=$ProjectId"
                    } else {
                        cmd.exe /c "gcloud secrets create $key --data-file=`"$tempFile`" --replication-policy=automatic --project=$ProjectId"
                    }
                } finally {
                    Remove-Item $tempFile -Force -ErrorAction SilentlyContinue
                }
            }
        }
    }
} else {
    Write-Warning "File $EnvFile not found. Skipping secrets population."
}

# 6. Deploy directly to Cloud Run
Write-Host "`n==> [6/6] Building and Deploying '$ServiceName' to Cloud Run..." -ForegroundColor Yellow
cmd.exe /c "gcloud run deploy $ServiceName --source . --region=$Region --project=$ProjectId --allow-unauthenticated --port=3000 --min-instances=1 --max-instances=10 --memory=1Gi --cpu=1 --cpu-throttling --timeout=300 --concurrency=80 --cpu-boost --service-account=$saEmail --set-env-vars=NODE_ENV=production,NEXT_TELEMETRY_DISABLED=1,FFMPEG_PATH=/usr/bin/ffmpeg"

Write-Host "`n==========================================================" -ForegroundColor Green
Write-Host " Migration Completed Successfully!" -ForegroundColor Green
Write-Host " Check Cloud Run at: https://console.cloud.google.com/run?project=$ProjectId" -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Green
