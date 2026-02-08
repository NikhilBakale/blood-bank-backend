#!/bin/bash

# Azure Backend Deployment Script
# Quick deployment of backend to Azure App Service

set -e

echo "☁️  Blood Bank Buddy - Azure Backend Deployment"
echo "================================================"
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

print_success() { echo -e "${GREEN}✓ $1${NC}"; }
print_error() { echo -e "${RED}✗ $1${NC}"; }
print_warning() { echo -e "${YELLOW}⚠ $1${NC}"; }
print_info() { echo -e "${BLUE}ℹ $1${NC}"; }

# Check if Azure CLI is installed
if ! command -v az &> /dev/null; then
    print_error "Azure CLI is not installed"
    print_info "Install from: https://aka.ms/installazurecli"
    exit 1
fi
print_success "Azure CLI found"

# Login check
print_info "Checking Azure login status..."
if ! az account show &> /dev/null; then
    print_warning "Not logged in to Azure"
    print_info "Logging in..."
    az login
fi
print_success "Logged in to Azure"

echo ""
print_info "Please provide deployment details:"
echo ""

# Get deployment details
read -p "Resource Group name (or create new): " RESOURCE_GROUP
read -p "App name (e.g., blood-bank-api): " APP_NAME
read -p "Location (e.g., eastus, westus): " LOCATION
read -p "Pricing tier (F1=Free, B1=Basic $13/month): " SKU

# Check if resource group exists
if az group show --name "$RESOURCE_GROUP" &> /dev/null; then
    print_success "Resource group '$RESOURCE_GROUP' exists"
else
    print_info "Creating resource group '$RESOURCE_GROUP'..."
    az group create --name "$RESOURCE_GROUP" --location "$LOCATION"
    print_success "Resource group created"
fi

echo ""
print_info "Deploying backend to Azure..."
echo ""

# Navigate to server directory
cd server

# Deploy using az webapp up
az webapp up \
    --resource-group "$RESOURCE_GROUP" \
    --name "$APP_NAME" \
    --runtime "NODE:20-lts" \
    --sku "$SKU" \
    --location "$LOCATION" \
    --os-type Linux

print_success "Backend deployed successfully!"
echo ""
print_info "Your backend URL: https://${APP_NAME}.azurewebsites.net"

echo ""
print_warning "Next steps:"
echo "1. Add environment variables in Azure Portal:"
echo "   - Go to App Service → Configuration"
echo "   - Add: SQL_SERVER, SQL_DATABASE, SQL_USER, SQL_PASSWORD"
echo "   - Add: FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, etc."
echo ""
echo "2. Test your backend:"
echo "   curl https://${APP_NAME}.azurewebsites.net/api/health"
echo ""
echo "3. Update frontend .env.local:"
echo "   VITE_API_URL=https://${APP_NAME}.azurewebsites.net"
echo ""

print_success "Deployment complete! 🎉"
