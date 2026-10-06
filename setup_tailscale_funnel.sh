#!/bin/bash
# ==============================================================================
# EIES Power Monitoring Platform — Tailscale Funnel Setup for Open Web Access
# Compatible with Orange Pi (Allwinner H3 / ARMv7) and Ubuntu / Debian Linux
# Eneftech Innovative Engineering Services • Tagbilaran City, Bohol
# ==============================================================================
set -e

PORT=${1:-3000}

echo "===================================================================="
echo "🌐 Setting up Tailscale Funnel for Open Web Access (Port ${PORT})"
echo "   EIES Power Monitoring Platform"
echo "===================================================================="

# 1. Check if Tailscale is installed
if ! command -v tailscale >/dev/null 2>&1; then
    echo "[1/4] Tailscale not detected. Installing via official installer..."
    curl -fsSL https://tailscale.com/install.sh | sh
else
    echo "[1/4] ✅ Tailscale is already installed ($(tailscale version | head -n 1))"
fi

# 2. Check if Tailscale is running & authenticated
echo "[2/4] Checking Tailscale connection status..."
if ! tailscale status >/dev/null 2>&1; then
    echo "⚠️  Tailscale is not logged in or running."
    echo "Starting Tailscale and generating login link..."
    sudo tailscale up
else
    echo "✅ Tailscale is authenticated and connected."
fi

# 3. Enable Tailscale Funnel for Port 3000
echo "[3/4] Activating Tailscale Funnel on port ${PORT}..."
echo "Running: sudo tailscale funnel --bg ${PORT}"
sudo tailscale funnel --bg "${PORT}" || {
    echo ""
    echo "⚠️  If Tailscale returned an ACL error:"
    echo "   Ensure Funnel is enabled in your Tailscale Admin Console (tailscale.com):"
    echo "   Navigate to Access Controls (ACLs) and ensure you have:"
    echo '   "nodeAttrs": [{"target": ["autogroup:member"], "attr": ["funnel"]}]'
    echo ""
}

# 4. Display live Funnel status & Public URL
echo "[4/4] Verifying Funnel status and retrieving your public HTTPS URL..."
tailscale funnel status || true

echo ""
echo "===================================================================="
echo "🎉 Tailscale Funnel Setup Complete!"
echo "===================================================================="
echo "Your EIES Power Monitoring Platform is now accessible on the OPEN WEB!"
echo "Anyone with your https://<node>.<tailnet>.ts.net link can view the dashboard"
echo "with fully automated, valid HTTPS encryption."
echo ""
echo "Helpful Commands:"
echo "  Check Status:      tailscale funnel status"
echo "  View Public URL:   tailscale status"
echo "  Turn Off Funnel:   sudo tailscale funnel --terminate"
echo "===================================================================="
