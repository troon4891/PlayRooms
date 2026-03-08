#!/usr/bin/with-contenv bashio

INTIFACE_PORT=$(bashio::config 'intiface_port')
SERVER_PORT=$(bashio::config 'server_port')
SCAN_ON_START=$(bashio::config 'scan_on_start')
USE_BLUETOOTH=$(bashio::config 'use_bluetooth')
USE_SERIAL=$(bashio::config 'use_serial')
USE_HID=$(bashio::config 'use_hid')
PORTAL_URL=$(bashio::config 'portal_url')
PORTAL_SECRET=$(bashio::config 'portal_secret')
ACCEPT_TERMS=$(bashio::config 'accept_terms')

# Export configuration for Node.js server
export INTIFACE_PORT="${INTIFACE_PORT}"
export SERVER_PORT="${SERVER_PORT}"
export SCAN_ON_START="${SCAN_ON_START}"
export USE_BLUETOOTH="${USE_BLUETOOTH}"
export USE_SERIAL="${USE_SERIAL}"
export USE_HID="${USE_HID}"
export DATA_DIR="/config"
export PORTAL_URL="${PORTAL_URL}"
export PORTAL_SECRET="${PORTAL_SECRET}"
export ACCEPT_TERMS="${ACCEPT_TERMS}"

bashio::log.info "Starting PlayRooms server on port ${SERVER_PORT}..."

# Start Node.js server (manages Intiface Engine internally)
exec node /app/server/dist/index.js
