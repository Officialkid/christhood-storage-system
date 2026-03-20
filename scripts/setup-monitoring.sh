#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# setup-monitoring.sh
#
# Creates the full Cloud Monitoring setup for Christhood CMMS:
#   1. Email notification channel (shared with log alerts)
#   2. Metric alert  — 5+ ERROR entries in 10 min → "CMMS Production Errors"
#   3. Log alert     — any ZARA_ERROR in logs → "Zara AI Offline"
#   4. Uptime check  — /api/assistant/health every 60 s → "CMMS Health Check"
#   5. Dashboard     — "CMMS Production Health" with 5 widgets
#
# Run ONCE after the first successful Cloud Run deployment:
#   bash scripts/setup-monitoring.sh
#
# Override alert email:
#   ALERT_EMAIL=you@example.com bash scripts/setup-monitoring.sh
#
# Prerequisites:
#   gcloud auth login
#   gcloud config set project dotted-spot-476513-i2
# ─────────────────────────────────────────────────────────────

set -euo pipefail

PROJECT_ID="dotted-spot-476513-i2"
SERVICE="christhood-cmms"
HOSTNAME="cmmschristhood.org"
HEALTH_PATH="/api/assistant/health"
NOTIFICATION_EMAIL="${ALERT_EMAIL:-admin@christhood.org}"
TMPDIR_CMMS="$(mktemp -d)"
trap 'rm -rf "$TMPDIR_CMMS"' EXIT

echo "=================================================="
echo "  Christhood CMMS — Cloud Monitoring Setup"
echo "=================================================="
echo "  Project : $PROJECT_ID"
echo "  Service : $SERVICE"
echo "  Hostname: $HOSTNAME"
echo "  Email   : $NOTIFICATION_EMAIL"
echo ""

# ─────────────────────────────────────────────────────────────
# Helper: find-or-create notification channel
# ─────────────────────────────────────────────────────────────
get_or_create_channel() {
  local existing
  existing=$(gcloud alpha monitoring channels list \
    --project="$PROJECT_ID" \
    --filter="displayName='Christhood CMMS Alerts'" \
    --format="value(name)" \
    --limit=1 2>/dev/null || true)

  if [[ -n "$existing" ]]; then
    echo "$existing"
    return
  fi

  local created
  created=$(gcloud alpha monitoring channels create \
    --display-name="Christhood CMMS Alerts" \
    --type=email \
    --channel-labels="email_address=${NOTIFICATION_EMAIL}" \
    --project="$PROJECT_ID" \
    --format="value(name)" 2>/dev/null)

  echo "$created"
}

echo "==> [1/5] Notification channel..."
CHANNEL_NAME=$(get_or_create_channel)
if [[ -z "$CHANNEL_NAME" ]]; then
  echo "    ERROR: Could not create notification channel. Is gcloud auth set up?" >&2
  exit 1
fi
echo "    $CHANNEL_NAME"
echo ""

# ─────────────────────────────────────────────────────────────
# Helper: create alert policy from inline JSON
# ─────────────────────────────────────────────────────────────
create_policy() {
  local label="$1"
  local json_file="$2"

  # Inject notification channel into JSON
  local tmp="${TMPDIR_CMMS}/${label}.json"
  sed "s|__CHANNEL__|${CHANNEL_NAME}|g" "$json_file" > "$tmp"

  local existing
  existing=$(gcloud monitoring policies list \
    --project="$PROJECT_ID" \
    --filter="displayName='[CMMS] ${label}'" \
    --format="value(name)" \
    --limit=1 2>/dev/null || true)

  if [[ -n "$existing" ]]; then
    echo "    Already exists — skipping."
  else
    gcloud monitoring policies create \
      --policy-from-file="$tmp" \
      --project="$PROJECT_ID" \
      --quiet 2>/dev/null \
      && echo "    Created." \
      || echo "    Failed (check gcloud auth and billing)."
  fi
}

# ─────────────────────────────────────────────────────────────
# [2/5] Metric alert — 5+ ERROR log entries in 10 minutes
# ─────────────────────────────────────────────────────────────
echo "==> [2/5] Alert policy: Production Error Spike (5+ errors / 10 min)..."

cat > "${TMPDIR_CMMS}/error-spike.json" << 'POLICY_EOF'
{
  "displayName": "[CMMS] Production Error Spike",
  "combiner": "OR",
  "enabled": true,
  "conditions": [
    {
      "displayName": "5+ ERROR log entries in 10 minutes",
      "conditionThreshold": {
        "filter": "resource.type=\"cloud_run_revision\" AND resource.labels.service_name=\"christhood-cmms\" AND metric.type=\"logging/log_entry_count\" AND metric.labels.severity=\"ERROR\"",
        "comparison": "COMPARISON_GT",
        "thresholdValue": 5,
        "duration": "0s",
        "aggregations": [
          {
            "alignmentPeriod": "600s",
            "perSeriesAligner": "ALIGN_SUM",
            "crossSeriesReducer": "REDUCE_SUM",
            "groupByFields": ["resource.labels.service_name"]
          }
        ],
        "trigger": { "count": 1 }
      }
    }
  ],
  "alertStrategy": {
    "notificationRateLimit": { "period": "3600s" },
    "autoClose": "604800s"
  },
  "notificationChannels": ["__CHANNEL__"],
  "documentation": {
    "content": "More than 5 ERROR-level log entries in a 10-minute window on Cloud Run service **christhood-cmms**.\n\nInvestigate: https://console.cloud.google.com/logs/query;query=resource.type%3D%22cloud_run_revision%22%20severity%3DERROR?project=dotted-spot-476513-i2"
  }
}
POLICY_EOF
create_policy "Production Error Spike" "${TMPDIR_CMMS}/error-spike.json"
echo ""

# ─────────────────────────────────────────────────────────────
# [3/5] Log-based alert — ZARA_ERROR in logs
#        (fires on every occurrence — Zara issues are always actionable)
# ─────────────────────────────────────────────────────────────
echo "==> [3/5] Alert policy: Zara AI Offline (ZARA_ERROR log entry)..."

cat > "${TMPDIR_CMMS}/zara-offline.json" << 'POLICY_EOF'
{
  "displayName": "[CMMS] Zara AI Offline",
  "combiner": "OR",
  "enabled": true,
  "conditions": [
    {
      "displayName": "ZARA_ERROR logged",
      "conditionMatchedLog": {
        "filter": "resource.type=\"cloud_run_revision\" AND resource.labels.service_name=\"christhood-cmms\" AND jsonPayload.event=\"ZARA_ERROR\" AND severity>=WARNING"
      }
    }
  ],
  "alertStrategy": {
    "notificationRateLimit": { "period": "1800s" },
    "autoClose": "604800s"
  },
  "notificationChannels": ["__CHANNEL__"],
  "documentation": {
    "content": "A ZARA_ERROR event was logged, indicating the Gemini AI assistant is failing.\n\nInvestigate: https://console.cloud.google.com/logs/query;query=resource.type%3D%22cloud_run_revision%22%20jsonPayload.event%3D~%22ZARA%22%20severity>%3DWARNING?project=dotted-spot-476513-i2"
  }
}
POLICY_EOF
create_policy "Zara AI Offline" "${TMPDIR_CMMS}/zara-offline.json"
echo ""

# ─────────────────────────────────────────────────────────────
# [4/5] Uptime check — /api/assistant/health every 60 s
# ─────────────────────────────────────────────────────────────
echo "==> [4/5] Uptime check: CMMS Health Check (every 60 s)..."

# Check if already exists
UPTIME_EXISTS=$(gcloud monitoring uptime list \
  --project="$PROJECT_ID" \
  --filter="displayName='CMMS Health Check'" \
  --format="value(name)" \
  --limit=1 2>/dev/null || true)

if [[ -n "$UPTIME_EXISTS" ]]; then
  echo "    Already exists — skipping."
else
  # Use REST API — gcloud monitoring uptime create is GA but syntax varies by version
  ACCESS_TOKEN=$(gcloud auth print-access-token 2>/dev/null)

  cat > "${TMPDIR_CMMS}/uptime.json" << UPTIME_EOF
{
  "displayName": "CMMS Health Check",
  "httpCheck": {
    "path": "${HEALTH_PATH}",
    "port": 443,
    "useSsl": true,
    "validateSsl": true,
    "requestMethod": "GET"
  },
  "monitoredResource": {
    "type": "uptime_url",
    "labels": {
      "project_id": "${PROJECT_ID}",
      "host": "${HOSTNAME}"
    }
  },
  "period": "60s",
  "timeout": "10s",
  "checkerType": "STATIC_IP_CHECKERS",
  "contentMatchers": [
    {
      "content": "status",
      "matcher": "CONTAINS_STRING"
    }
  ],
  "selectedRegions": [
    "USA",
    "EUROPE",
    "ASIA_PACIFIC"
  ]
}
UPTIME_EOF

  HTTP_STATUS=$(curl -s -o "${TMPDIR_CMMS}/uptime-response.json" -w "%{http_code}" \
    -X POST \
    "https://monitoring.googleapis.com/v3/projects/${PROJECT_ID}/uptimeCheckConfigs" \
    -H "Authorization: Bearer ${ACCESS_TOKEN}" \
    -H "Content-Type: application/json" \
    -d @"${TMPDIR_CMMS}/uptime.json")

  if [[ "$HTTP_STATUS" == "200" ]]; then
    UPTIME_ID=$(python3 -c "import json,sys; d=json.load(open('${TMPDIR_CMMS}/uptime-response.json')); print(d.get('name',''))" 2>/dev/null || echo "")
    echo "    Created: ${UPTIME_ID:-uptime check}"

    # Create an alert policy for the uptime check failing from 2+ regions
    if [[ -n "$UPTIME_ID" ]]; then
      cat > "${TMPDIR_CMMS}/uptime-alert.json" << UPTIME_ALERT_EOF
{
  "displayName": "[CMMS] App Unreachable (Uptime Check Failed)",
  "combiner": "OR",
  "enabled": true,
  "conditions": [
    {
      "displayName": "Health check failing from 2+ regions",
      "conditionThreshold": {
        "filter": "resource.type=\"uptime_url\" AND metric.type=\"monitoring/uptime_check/check_passed\" AND metric.labels.check_id=\"$(basename "${UPTIME_ID}")\"",
        "comparison": "COMPARISON_LT",
        "thresholdValue": 1,
        "duration": "120s",
        "aggregations": [
          {
            "alignmentPeriod": "60s",
            "perSeriesAligner": "ALIGN_FRACTION_TRUE",
            "crossSeriesReducer": "REDUCE_COUNT_FALSE",
            "groupByFields": []
          }
        ],
        "trigger": { "count": 2 }
      }
    }
  ],
  "alertStrategy": {
    "notificationRateLimit": { "period": "3600s" },
    "autoClose": "604800s"
  },
  "notificationChannels": ["__CHANNEL__"],
  "documentation": {
    "content": "The /api/assistant/health endpoint on cmmschristhood.org is failing from 2 or more geographic regions.\n\nThis means Cloud Run is down or not responding. Check: https://console.cloud.google.com/run/detail/us-central1/christhood-cmms/logs?project=dotted-spot-476513-i2"
  }
}
UPTIME_ALERT_EOF
      create_policy "App Unreachable (Uptime Check Failed)" "${TMPDIR_CMMS}/uptime-alert.json"
    fi
  else
    echo "    WARNING: Uptime check REST call returned HTTP ${HTTP_STATUS}."
    echo "    You can create it manually in: Monitoring → Uptime Checks → Create"
    echo "    URL: https://${HOSTNAME}${HEALTH_PATH}"
  fi
fi
echo ""

# ─────────────────────────────────────────────────────────────
# [5/5] Dashboard — "CMMS Production Health"
# ─────────────────────────────────────────────────────────────
echo "==> [5/5] Dashboard: CMMS Production Health..."

DASH_EXISTS=$(gcloud monitoring dashboards list \
  --project="$PROJECT_ID" \
  --filter="displayName='CMMS Production Health'" \
  --format="value(name)" \
  --limit=1 2>/dev/null || true)

if [[ -n "$DASH_EXISTS" ]]; then
  echo "    Already exists — skipping."
else
  cat > "${TMPDIR_CMMS}/dashboard.json" << 'DASH_EOF'
{
  "displayName": "CMMS Production Health",
  "mosaicLayout": {
    "columns": 12,
    "tiles": [
      {
        "xPos": 0, "yPos": 0, "width": 6, "height": 4,
        "widget": {
          "title": "Request Count (req/min)",
          "xyChart": {
            "dataSets": [{
              "timeSeriesQuery": {
                "timeSeriesFilter": {
                  "filter": "metric.type=\"run.googleapis.com/request_count\" resource.type=\"cloud_run_revision\" resource.labels.service_name=\"christhood-cmms\"",
                  "aggregation": {
                    "alignmentPeriod": "60s",
                    "perSeriesAligner": "ALIGN_RATE",
                    "crossSeriesReducer": "REDUCE_SUM",
                    "groupByFields": ["resource.labels.service_name"]
                  }
                }
              },
              "plotType": "LINE",
              "legendTemplate": "requests/s"
            }],
            "yAxis": { "label": "req/s", "scale": "LINEAR" }
          }
        }
      },
      {
        "xPos": 6, "yPos": 0, "width": 6, "height": 4,
        "widget": {
          "title": "5xx Error Rate",
          "xyChart": {
            "dataSets": [{
              "timeSeriesQuery": {
                "timeSeriesFilter": {
                  "filter": "metric.type=\"run.googleapis.com/request_count\" resource.type=\"cloud_run_revision\" resource.labels.service_name=\"christhood-cmms\" metric.labels.response_code_class=\"5xx\"",
                  "aggregation": {
                    "alignmentPeriod": "60s",
                    "perSeriesAligner": "ALIGN_RATE",
                    "crossSeriesReducer": "REDUCE_SUM",
                    "groupByFields": ["resource.labels.service_name"]
                  }
                }
              },
              "plotType": "LINE",
              "legendTemplate": "5xx errors/s"
            }],
            "yAxis": { "label": "errors/s", "scale": "LINEAR" }
          }
        }
      },
      {
        "xPos": 0, "yPos": 4, "width": 6, "height": 4,
        "widget": {
          "title": "Request Latency p99 (ms)",
          "xyChart": {
            "dataSets": [{
              "timeSeriesQuery": {
                "timeSeriesFilter": {
                  "filter": "metric.type=\"run.googleapis.com/request_latencies\" resource.type=\"cloud_run_revision\" resource.labels.service_name=\"christhood-cmms\"",
                  "aggregation": {
                    "alignmentPeriod": "60s",
                    "perSeriesAligner": "ALIGN_PERCENTILE_99",
                    "crossSeriesReducer": "REDUCE_MAX",
                    "groupByFields": ["resource.labels.service_name"]
                  }
                }
              },
              "plotType": "LINE",
              "legendTemplate": "p99 latency"
            }],
            "yAxis": { "label": "ms", "scale": "LINEAR" }
          }
        }
      },
      {
        "xPos": 6, "yPos": 4, "width": 6, "height": 4,
        "widget": {
          "title": "Active Cloud Run Instances",
          "xyChart": {
            "dataSets": [{
              "timeSeriesQuery": {
                "timeSeriesFilter": {
                  "filter": "metric.type=\"run.googleapis.com/container/instance_count\" resource.type=\"cloud_run_revision\" resource.labels.service_name=\"christhood-cmms\"",
                  "aggregation": {
                    "alignmentPeriod": "60s",
                    "perSeriesAligner": "ALIGN_MAX",
                    "crossSeriesReducer": "REDUCE_SUM",
                    "groupByFields": ["resource.labels.service_name"]
                  }
                }
              },
              "plotType": "LINE",
              "legendTemplate": "instances"
            }],
            "yAxis": { "label": "instances", "scale": "LINEAR" }
          }
        }
      },
      {
        "xPos": 0, "yPos": 8, "width": 12, "height": 4,
        "widget": {
          "title": "ERROR Log Entries Over Time",
          "xyChart": {
            "dataSets": [{
              "timeSeriesQuery": {
                "timeSeriesFilter": {
                  "filter": "resource.type=\"cloud_run_revision\" metric.type=\"logging/log_entry_count\" resource.labels.service_name=\"christhood-cmms\" metric.labels.severity=\"ERROR\"",
                  "aggregation": {
                    "alignmentPeriod": "60s",
                    "perSeriesAligner": "ALIGN_SUM",
                    "crossSeriesReducer": "REDUCE_SUM",
                    "groupByFields": ["resource.labels.service_name"]
                  }
                }
              },
              "plotType": "STACKED_BAR",
              "legendTemplate": "ERROR entries"
            }],
            "yAxis": { "label": "log entries", "scale": "LINEAR" }
          }
        }
      }
    ]
  }
}
DASH_EOF

  gcloud monitoring dashboards create \
    --config-from-file="${TMPDIR_CMMS}/dashboard.json" \
    --project="$PROJECT_ID" \
    --quiet 2>/dev/null \
    && echo "    Created." \
    || echo "    Failed. Create manually: Monitoring → Dashboards → Import JSON."
fi
echo ""

# ─────────────────────────────────────────────────────────────
# Summary
# ─────────────────────────────────────────────────────────────
echo "=================================================="
echo "  Setup complete. Next steps:"
echo "=================================================="
echo ""
echo "  1. CHECK YOUR EMAIL ($NOTIFICATION_EMAIL)"
echo "     Google will send a verification email for the notification"
echo "     channel — click 'Verify email address' before alerts can fire."
echo ""
echo "  2. DASHBOARD (bookmark this URL):"
echo "     https://console.cloud.google.com/monitoring/dashboards?project=$PROJECT_ID"
echo ""
echo "  3. ALERT POLICIES:"
echo "     https://console.cloud.google.com/monitoring/alerting?project=$PROJECT_ID"
echo "     Confirm all policies show 'Enabled' and use your channel."
echo ""
echo "  4. UPTIME CHECKS:"
echo "     https://console.cloud.google.com/monitoring/uptime?project=$PROJECT_ID"
echo "     The CMMS Health Check should show green within ~2 minutes."
echo ""
echo "  5. LOGS EXPLORER (save these as bookmarks):"
echo ""
echo "  All Errors Today:"
echo '    resource.type="cloud_run_revision" severity=ERROR timestamp>="today"'
echo ""
echo "  Zara Issues:"
echo '    resource.type="cloud_run_revision" jsonPayload.event=~"ZARA" severity>=WARNING'
echo ""
echo "  Upload Failures:"
echo '    resource.type="cloud_run_revision" jsonPayload.event="FILE_UPLOAD_FAILED"'
echo ""
echo "  Login Failures:"
echo '    resource.type="cloud_run_revision" jsonPayload.event="USER_LOGIN_FAILED"'
echo ""
echo "  Slow Operations:"
echo '    resource.type="cloud_run_revision" jsonPayload.event="SLOW_OPERATION"'
echo ""
echo "  All 500 Errors:"
echo '    resource.type="cloud_run_revision" jsonPayload.event="API_ERROR" severity=ERROR'
echo ""
